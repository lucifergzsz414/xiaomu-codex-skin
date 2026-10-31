using System;
using System.IO;
using System.Security.Cryptography;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Threading;
using System.Windows.Forms;

internal static class XiaomuSkinManager {
    [STAThread]
    private static void Main() {
        try {
            string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "control-center.ps1");
            using (var sha = SHA256.Create()) {
                string digest = BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(script))).Replace("-", "").ToLowerInvariant();
                if (digest != "__CONTROL_CENTER_SHA256__") throw new InvalidOperationException("Management window integrity check failed.");
                string worker = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "control-actions.ps1");
                string workerDigest = BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(worker))).Replace("-", "").ToLowerInvariant();
                if (workerDigest != "__CONTROL_ACTIONS_SHA256__") throw new InvalidOperationException("Management worker is damaged. Open manage.vbs from a fresh complete package to repair or restore.");
            }
            var initialState = InitialSessionState.CreateDefault();
            initialState.ExecutionPolicy = Microsoft.PowerShell.ExecutionPolicy.Bypass;
            using (var runspace = RunspaceFactory.CreateRunspace(initialState)) {
                runspace.ApartmentState = ApartmentState.STA;
                runspace.ThreadOptions = PSThreadOptions.UseCurrentThread;
                runspace.Open();
                runspace.SessionStateProxy.SetVariable("XiaomuControlWorkerSha256", "__CONTROL_ACTIONS_SHA256__");
                using (var ps = PowerShell.Create()) {
                    ps.Runspace = runspace;
                    ps.AddCommand(script);
                    ps.Invoke();
                    if (ps.HadErrors) throw new InvalidOperationException(ps.Streams.Error[0].ToString());
                }
            }
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Xiaomu Codex", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
