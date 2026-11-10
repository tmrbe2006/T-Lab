; =============================================================================
; T-Lab Medical Laboratory & ERP System - Inno Setup 6 Installer Script
; متوافق مع برنامج Inno Setup 6 (الإصدار 6.0 وما بعده)
; طريقة التجميع (Compile):
;   1. شغل ملف build-installer.bat
;   أو:
;   2. افتح هذا الملف (tlab-setup.iss) ببرنامج Inno Setup Compiler 6 واضغط Build -> Compile (Ctrl+F9)
; =============================================================================

#define MyAppName "T-Lab Medical Laboratory System"
#define MyAppNameAr "نظام إدارة معمل التحاليل الطبية T-Lab"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "T-Lab Medical Systems"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "start-tlab-production.bat"

[Setup]
AppId={{8F6E3D2A-9B4C-4E1F-A7D8-3C5B9E102471}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\T-Lab-System
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; مجلد حفظ ملف السيتاب النهائي (.exe)
OutputDir=Output
OutputBaseFilename=T-Lab_Setup_v{#MyAppVersion}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon} (إنشاء اختصار لنظام المعمل على سطح المكتب)"; GroupDescription: "{cm:AdditionalIcons}"
Name: "importdb"; Description: "استيراد قاعدة البيانات الفارغة (جدول المستخدمين فقط) تلقائياً إلى MySQL Server"; GroupDescription: "إعداد قاعدة بيانات MySQL (5.5 / 8.0.28):"

[Files]
; نسخ ملفات المشروع الأساسية بالكامل مع استثناء مجلدات التطوير المؤقتة
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "Output\*,dist-installer\*,.git\*,coverage\*,*.iss"

[Icons]
; اختصار قائمة ابدأ (Start Menu)
Name: "{group}\{#MyAppName} (تشغيل النظام)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\تغيير بورت التشغيل (Select Port)"; Filename: "{app}\start-windows.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 21
Name: "{group}\إيقاف السيرفر (Stop T-Lab Server)"; Filename: "{app}\stop-tlab.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 27
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; اختصار سطح المكتب (Desktop Shortcut)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13; Tasks: desktopicon

[Run]
; تثبيت الحزم تلقائياً إذا لم يكن مجلد node_modules منسوخاً بالكامل
Filename: "cmd.exe"; Parameters: "/c if not exist ""{app}\node_modules\express"" npm install --legacy-peer-deps"; WorkingDir: "{app}"; StatusMsg: "جاري التحقق من مكتبات التشغيل (Node Modules)..."; Flags: runhidden waituntilterminated

; تشغيل النظام بعد انتهاء التثبيت
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "تشغيل نظام معمل التحاليل الطبية T-Lab الآن"; Flags: nowait postinstall skipifsilent shellexec

[Code]
var
  ServerConfigPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  // إنشاء شاشة إعداد السيرفر وقاعدة بيانات MySQL أثناء التثبيت
  ServerConfigPage := CreateInputQueryPage(
    wpSelectTasks,
    'إعدادات السيرفر وقاعدة بيانات MySQL (Server & MySQL Configuration)',
    'حدد رقم البورت وبيانات الاتصال بسيرفر MySQL (5.5 أو 8.0.28)',
    'سيقوم معالج التثبيت بإنشاء ملف .env و port.config.json تلقائياً بهذه الإعدادات:'
  );

  ServerConfigPage.Add('بورت تشغيل البرنامج (Application Port):', False);
  ServerConfigPage.Add('عنوان سيرفر MySQL (MYSQL_HOST):', False);
  ServerConfigPage.Add('بورت سيرفر MySQL (MYSQL_PORT):', False);
  ServerConfigPage.Add('اسم مستخدم MySQL (MYSQL_USER):', False);
  ServerConfigPage.Add('كلمة مرور MySQL (MYSQL_PASSWORD):', True);
  ServerConfigPage.Add('اسم قاعدة البيانات (MYSQL_DATABASE):', False);

  // القيم الافتراضية
  ServerConfigPage.Values[0] := '3000';
  ServerConfigPage.Values[1] := '127.0.0.1';
  ServerConfigPage.Values[2] := '3306';
  ServerConfigPage.Values[3] := 'root';
  ServerConfigPage.Values[4] := '';
  ServerConfigPage.Values[5] := 'tlab_db';
end;

function FindMySQLExePath(): String;
begin
  Result := '';
  if FileExists('C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
  else if FileExists('C:\Program Files\MySQL\MySQL Server 5.5\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 5.5\bin\mysql.exe'
  else if FileExists('C:\Program Files (x86)\MySQL\MySQL Server 5.5\bin\mysql.exe') then
    Result := 'C:\Program Files (x86)\MySQL\MySQL Server 5.5\bin\mysql.exe';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppPort, DbHost, DbPort, DbUser, DbPass, DbName: String;
  EnvContent, PortJsonContent: String;
  MySQLExe, ImportCmd: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    AppPort := Trim(ServerConfigPage.Values[0]);
    if AppPort = '' then AppPort := '3000';

    DbHost := Trim(ServerConfigPage.Values[1]);
    if DbHost = '' then DbHost := '127.0.0.1';

    DbPort := Trim(ServerConfigPage.Values[2]);
    if DbPort = '' then DbPort := '3306';

    DbUser := Trim(ServerConfigPage.Values[3]);
    if DbUser = '' then DbUser := 'root';

    DbPass := ServerConfigPage.Values[4];

    DbName := Trim(ServerConfigPage.Values[5]);
    if DbName = '' then DbName := 'tlab_db';

    // 1. كتابة ملف .env تلقائياً
    EnvContent :=
      '# T-Lab Server & MySQL Configuration (Generated by Inno Setup 6)' + #13#10 +
      'PORT=' + AppPort + #13#10 +
      'HOST=0.0.0.0' + #13#10 +
      'NODE_ENV=production' + #13#10 +
      'MYSQL_HOST=' + DbHost + #13#10 +
      'MYSQL_PORT=' + DbPort + #13#10 +
      'MYSQL_USER=' + DbUser + #13#10 +
      'MYSQL_PASSWORD=' + DbPass + #13#10 +
      'MYSQL_DATABASE=' + DbName + #13#10 +
      'MYSQL_CHARSET=utf8_general_ci' + #13#10 +
      'MYSQL_CONNECTION_TIMEOUT=8000' + #13#10 +
      'MYSQL_AUTO_SYNC=true' + #13#10 +
      'APP_URL=http://localhost:' + AppPort + #13#10;

    SaveStringToFile(ExpandConstant('{app}\.env'), EnvContent, False);

    // 2. كتابة ملف port.config.json تلقائياً
    PortJsonContent := '{' + #13#10 + '  "port": ' + AppPort + #13#10 + '}';
    SaveStringToFile(ExpandConstant('{app}\port.config.json'), PortJsonContent, False);

    // 3. استيراد قاعدة البيانات الفارغة (جدول المستخدمين فقط) تلقائياً إلى MySQL إذا تم تحديد الخيار
    if WizardIsTaskSelected('importdb') then
    begin
      MySQLExe := FindMySQLExePath();
      if MySQLExe <> '' then
      begin
        if DbPass <> '' then
          ImportCmd := '/c ""' + MySQLExe + '" -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' -p' + DbPass + ' < "' + ExpandConstant('{app}\tlab_empty_except_users.sql') + '""'
        else
          ImportCmd := '/c ""' + MySQLExe + '" -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' < "' + ExpandConstant('{app}\tlab_empty_except_users.sql') + '""';

        Exec('cmd.exe', ImportCmd, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
      end;
    end;
  end;
end;
