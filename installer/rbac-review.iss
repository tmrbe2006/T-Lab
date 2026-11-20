; Non-destructive, isolated Windows evaluation installer for the original main branch.
; This installer never executes SQL, stops services, or rewrites existing installations.
#define AppName "T-Lab RBAC Review"
#define AppVersion "6.1.0-rbac"
[Setup]
AppId={{B752B972-1626-4898-A94A-CC512DC93911}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\T-Lab-RBAC-Review
DefaultGroupName={#AppName}
OutputDir=Output
OutputBaseFilename=T-Lab_RBAC_Review_Windows
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\node.exe
CloseApplications=no
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env,*.log"
[Icons]
Name: "{autoprograms}\T-Lab RBAC Review"; Filename: "{app}\launch-rbac-review.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\T-Lab RBAC Review"; Filename: "{app}\launch-rbac-review.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"
[Run]
Filename: "{app}\launch-rbac-review.cmd"; WorkingDir: "{app}"; Description: "Start T-Lab RBAC Review (local evaluation)"; Flags: postinstall skipifsilent nowait
