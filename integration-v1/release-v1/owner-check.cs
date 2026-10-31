using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

// Read-only identity gate. Never changes processes, windows or network settings.
internal static class OwnerCheck {
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table, ref uint size, bool sorted, uint family, uint kind, uint reserved);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)] static extern int GetPackageFullName(IntPtr handle, ref uint length, StringBuilder name);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, ExactSpelling=true)] static extern bool QueryFullProcessImageNameW(IntPtr handle, uint flags, StringBuilder path, ref uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid, out uint session);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
  struct Listener { public uint Pid; public bool Loopback; }
  static uint Word(byte[] bytes, int offset) { return BitConverter.ToUInt32(bytes, offset); }
  static int Port(uint raw) { return (int)(((raw & 255) << 8) | ((raw >> 8) & 255)); }
  static List<Listener> Parse(byte[] table, bool ipv6) {
    if (table.Length < 4) throw new Exception("TCP_TABLE_TRUNCATED");
    uint count = Word(table, 0); int rowSize = ipv6 ? 56 : 24;
    if (count > (table.Length - 4) / rowSize) throw new Exception("TCP_ROWS_TRUNCATED");
    var found = new List<Listener>();
    for (int i=0; i<count; i++) {
      int row=4+i*rowSize;
      if (Port(Word(table, row+(ipv6?20:8))) != 9335 || Word(table,row+(ipv6?48:0)) != 2) continue;
      // MIB_TCP_STATE_LISTEN = 2. Only the exact IPv4 loopback binding is eligible.
      found.Add(new Listener { Pid=Word(table,row+(ipv6?52:20)), Loopback=!ipv6 && Word(table,row+4)==0x0100007f });
    }
    return found;
  }
  static byte[] ReadTable(uint family) {
    uint size=0;
    if (GetExtendedTcpTable(IntPtr.Zero,ref size,false,family,3,0)!=122) throw new Exception("TCP_SIZE_FAILED");
    for (int attempt=0; attempt<3; attempt++) {
      if (size<4 || size>16777216) throw new Exception("TCP_SIZE_INVALID");
      uint allocated=size; IntPtr memory=Marshal.AllocHGlobal((int)allocated);
      try {
        uint result=GetExtendedTcpTable(memory,ref size,false,family,3,0);
        if(result==122) continue;
        if(result!=0 || size>allocated) throw new Exception("TCP_READ_FAILED");
        var data=new byte[size]; Marshal.Copy(memory,data,0,(int)size); return data;
      } finally { Marshal.FreeHGlobal(memory); }
    }
    throw new Exception("TCP_TABLE_CHANGED");
  }
  static uint Select(List<Listener> rows) {
    if(rows.Count!=1 || !rows[0].Loopback || rows[0].Pid==0) throw new Exception("LISTENER_MISMATCH");
    return rows[0].Pid;
  }
  static uint Owner() {
    var rows=Parse(ReadTable(2),false); rows.AddRange(Parse(ReadTable(23),true)); return Select(rows);
  }
  static void Alive(IntPtr process) {
    uint code; if(!GetExitCodeProcess(process,out code) || code!=259) throw new Exception("PROCESS_ENDED");
  }
  static void SelfTest() {
    byte[] row=new byte[28]; BitConverter.GetBytes((uint)1).CopyTo(row,0);
    BitConverter.GetBytes((uint)2).CopyTo(row,4); BitConverter.GetBytes((uint)0x0100007f).CopyTo(row,8);
    BitConverter.GetBytes((uint)0x7724).CopyTo(row,12); BitConverter.GetBytes((uint)42).CopyTo(row,24);
    if(Select(Parse(row,false))!=42) throw new Exception("SELF_TEST_PORT");
    BitConverter.GetBytes((uint)0).CopyTo(row,8);
    bool rejected=false; try { Select(Parse(row,false)); } catch { rejected=true; }
    if(!rejected) throw new Exception("SELF_TEST_BIND");
    var duplicates=new List<Listener>(); duplicates.Add(new Listener {Pid=42,Loopback=true}); duplicates.Add(new Listener {Pid=42,Loopback=true});
    rejected=false; try { Select(duplicates); } catch { rejected=true; }
    if(!rejected) throw new Exception("SELF_TEST_DUPLICATES");
    rejected=false; try { Parse(new byte[5],false); var broken=new byte[4]; BitConverter.GetBytes((uint)1).CopyTo(broken,0); Parse(broken,false); } catch { rejected=true; }
    if(!rejected) throw new Exception("SELF_TEST_TRUNCATED");
    byte[] v6=new byte[60]; BitConverter.GetBytes((uint)1).CopyTo(v6,0); BitConverter.GetBytes((uint)0x7724).CopyTo(v6,24); BitConverter.GetBytes((uint)2).CopyTo(v6,52); BitConverter.GetBytes((uint)42).CopyTo(v6,56);
    rejected=false; try { Select(Parse(v6,true)); } catch { rejected=true; }
    if(!rejected) throw new Exception("SELF_TEST_IPV6");
    Console.WriteLine("verified");
  }
  static int Main(string[] args) {
    try {
      if(args.Length==1 && args[0]=="self-test") { SelfTest(); return 0; }
      if(args.Length!=7 || (args[0]!="discover" && args[0]!="verify")) throw new Exception("ARGUMENTS_INVALID");
      uint expectedSession=uint.Parse(args[4],CultureInfo.InvariantCulture), expectedPid=uint.Parse(args[5],CultureInfo.InvariantCulture);
      if(args[0]=="verify" && expectedPid==0) throw new Exception("OWNER_REQUIRED");
      if(!System.Text.RegularExpressions.Regex.IsMatch(args[1],@"^OpenAI\.Codex_[0-9.]+_x64__2p2nqsd0c76g0$") || !System.Text.RegularExpressions.Regex.IsMatch(args[3],@"\A[0-9A-Fa-f]{64}\z")) throw new Exception("EXPECTED_IDENTITY_INVALID");
      uint pid=Owner(); if(expectedPid>0 && pid!=expectedPid) throw new Exception("OWNER_CHANGED");
      IntPtr process=OpenProcess(0x1000,false,pid); if(process==IntPtr.Zero) throw new Exception("PROCESS_UNAVAILABLE");
      try {
        Alive(process); uint session; long created,exited,kernel,user;
        if(!ProcessIdToSessionId(pid,out session) || session!=expectedSession || !GetProcessTimes(process,out created,out exited,out kernel,out user)) throw new Exception("PROCESS_IDENTITY_FAILED");
        DateTime start=DateTime.FromFileTimeUtc(created);
        if(expectedPid>0 && start!=DateTime.Parse(args[6],CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind).ToUniversalTime()) throw new Exception("PROCESS_INSTANCE_CHANGED");
        uint length=32768; var image=new StringBuilder((int)length);
        if(!QueryFullProcessImageNameW(process,0,image,ref length) || !String.Equals(Path.GetFullPath(image.ToString()),Path.GetFullPath(args[2]),StringComparison.OrdinalIgnoreCase)) throw new Exception("IMAGE_MISMATCH");
        length=1024; var package=new StringBuilder((int)length);
        if(GetPackageFullName(process,ref length,package)!=0 || !String.Equals(package.ToString(),args[1],StringComparison.Ordinal)) throw new Exception("PACKAGE_MISMATCH");
        using(var hash=SHA256.Create()) using(var file=new FileStream(image.ToString(),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)) {
          if(!String.Equals(BitConverter.ToString(hash.ComputeHash(file)).Replace("-",""),args[3],StringComparison.OrdinalIgnoreCase)) throw new Exception("IMAGE_HASH_MISMATCH");
        }
        Alive(process); if(Owner()!=pid) throw new Exception("LISTENER_CHANGED");
        if(args[0]=="verify") Console.WriteLine("verified");
        else Console.WriteLine("{\"pid\":"+pid+",\"startUtc\":\""+start.ToString("o",CultureInfo.InvariantCulture)+"\",\"session\":"+session+"}");
      } finally { CloseHandle(process); }
      return 0;
    } catch(Exception error) {
      Console.Error.WriteLine(System.Text.RegularExpressions.Regex.IsMatch(error.Message,@"\A[A-Z_]+\z")?error.Message:"IDENTITY_CHECK_FAILED"); return 1;
    }
  }
}
