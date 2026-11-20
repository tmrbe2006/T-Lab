; Non-destructive, isolated Windows evaluation installer for the original main branch.
; This installer never executes SQL, stops services, or rewrites existing installations.
#define AppName "T-Lab Multi-Branch Finance Pilot"
#define AppVersion "6.1.0-mb4"
[Setup]
AppId={{A4977193-AD98-4B98-BB78-69554FB0A4DD}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\T-Lab-MultiBranch-Pilot
DefaultGroupName={#AppName}
OutputDir=Output
OutputBaseFilename=T-Lab_MultiBranch_Phase4_Finance_Windows
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
DisableProgramGroupPage=yes
SetupIconFile=tlab-new-icon.ico
UninstallDisplayIcon={app}\tlab-new-icon.ico
CloseApplications=no
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "tlab-new-icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env,*.log"
[Icons]
Name: "{autoprograms}\T-Lab Multi-Branch Schema Pilot"; Filename: "{app}\launch-multibranch-pilot.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\tlab-new-icon.ico"
Name: "{autodesktop}\T-Lab Multi-Branch Schema Pilot"; Filename: "{app}\launch-multibranch-pilot.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\tlab-new-icon.ico"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"
[Run]
Filename: "{app}\launch-multibranch-pilot.cmd"; WorkingDir: "{app}"; Description: "Start T-Lab Multi-Branch Schema Pilot (local evaluation)"; Flags: postinstall skipifsilent nowait
