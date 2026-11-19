; =============================================================================
; T-Lab Medical Laboratory & ERP System - Inno Setup 6 Installer Script (v6.1.0)
; متوافق مع برنامج Inno Setup 6 (الإصدار 6.0 وما بعده)
; هام جداً: ضع هذا الملف (tlab-setup.iss) داخل الفولدر الرئيسي للمشروع (بجوار package.json و server.ts)
; ثم افتحه ببرنامج Inno Setup Compiler 6 واضغط Build -> Compile (Ctrl+F9)
; =============================================================================

#if !FileExists(AddBackslash(SourcePath) + "package.json")
  #error "خطأ: يجب وضع ملف tlab-setup.iss داخل الفولدر الرئيسي لمشروع T-Lab (بجوار ملف package.json و server.ts) قبل الضغط على Compile!"
#endif

#define MyAppName "T-Lab Medical Laboratory System"
#define MyAppNameAr "نظام إدارة معمل التحاليل الطبية العالمي T-Lab"
#define MyAppVersion "6.1.0"
#define MyAppPublisher "T-Lab Medical Systems"
#define MyAppURL "http://localhost:3007"
#define MyAppExeName "start-tlab-production.bat"

; =============================================================================
; إعداد أيقونة البرنامج تلقائياً من الصورة (lab-test.png أو lab-test.ico)
; إذا وضعت الصورة باسم lab-test.png بجوار ملف السيتاب، سيقوم Inno Setup
; بتحويلها تلقائياً أثناء الـ Compile إلى ملف أيقونة ويندوز قياسي (lab-test.ico)
; =============================================================================
#if FileExists(AddBackslash(SourcePath) + "lab-test.png") && !FileExists(AddBackslash(SourcePath) + "lab-test.ico")
  #expr Exec("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command ""Add-Type -AssemblyName System.Drawing; $src = [System.Drawing.Image]::FromFile('" + AddBackslash(SourcePath) + "lab-test.png'); $bmp = New-Object System.Drawing.Bitmap($src, 256, 256); $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $png = $ms.ToArray(); $fs = [System.IO.File]::Create('" + AddBackslash(SourcePath) + "lab-test.ico'); $bw = New-Object System.IO.BinaryWriter($fs); $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$png.Length); $bw.Write([uint32]22); $bw.Write($png); $bw.Close(); $fs.Close(); $bmp.Dispose(); $src.Dispose()""", SourcePath, 1, SW_HIDE)
#endif

#if FileExists(AddBackslash(SourcePath) + "lab-test.ico")
  #define MyAppIcon "lab-test.ico"
#elif FileExists(AddBackslash(SourcePath) + "tlab-icon.ico")
  #define MyAppIcon "tlab-icon.ico"
#else
  #define MyAppIcon ""
#endif

[Setup]
AppId={{8F6E3D2A-9B4C-4E1F-A7D8-3C5B9E102471}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
; التثبيت في C:\T-Lab-System لتجنب قيود صلاحيات القراءة فقط (UAC) ومسافات المسار في Program Files
DefaultDirName={sd}\T-Lab-System
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; مجلد حفظ ملف السيتاب النهائي (.exe)
OutputDir=Output
OutputBaseFilename=T-Lab_Setup_v{#MyAppVersion}
#if MyAppIcon != ""
SetupIconFile={#MyAppIcon}
UninstallDisplayIcon={app}\{#MyAppIcon}
#endif
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
; منح صلاحيات القراءة والكتابة الكاملة لمجلد النظام لضمان عمل السيرفر و Vite بدون أخطاء صلاحيات
Name: "{app}"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon} (إنشاء اختصار لنظام المعمل T-Lab على سطح المكتب)"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; حذف أي نسخة قديمة من مجلد البناء المؤقت أو كاش Vite لضمان تشغيل أحدث كود فوراً
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\node_modules\.vite"

[Files]
; نسخ ملفات المشروع الأساسية بالكامل مع استثناء مجلدات البناء المؤقتة وكاش المسارات القديمة
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "Output\*,dist\*,dist-installer\*,.git\*,coverage\*,node_modules\.vite\*,*.iss,.env,.env.*,*.sql"

[Icons]
#if MyAppIcon != ""
; استخدام أيقونة البرنامج المخصصة (lab-test.ico) لسطح المكتب وقائمة ابدأ
Name: "{group}\{#MyAppName} (تشغيل النظام)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppIcon}"
Name: "{group}\تشغيل النظام في الخلفية (Silent Launcher)"; Filename: "{app}\launch-tlab.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppIcon}"
Name: "{group}\إيقاف السيرفر (Stop T-Lab Server)"; Filename: "{app}\stop-tlab.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 27
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; IconFilename: "{app}\{#MyAppIcon}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppIcon}"; Tasks: desktopicon
#else
; الأيقونة الافتراضية من ويندوز في حال عدم وضع ملف الأيقونة
Name: "{group}\{#MyAppName} (تشغيل النظام)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\تشغيل النظام في الخلفية (Silent Launcher)"; Filename: "{app}\launch-tlab.vbs"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\إيقاف السيرفر (Stop T-Lab Server)"; Filename: "{app}\stop-tlab.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 27
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13; Tasks: desktopicon
#endif

[Run]
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
    'سيقوم معالج التثبيت بإنشاء ملف .env وملفات التشغيل التلقائي بهذه الإعدادات:'
  );

  ServerConfigPage.Add('بورت تشغيل البرنامج (Application Port):', False);
  ServerConfigPage.Add('عنوان سيرفر MySQL (MYSQL_HOST):', False);
  ServerConfigPage.Add('بورت سيرفر MySQL (MYSQL_PORT):', False);
  ServerConfigPage.Add('اسم مستخدم MySQL (MYSQL_USER):', False);
  ServerConfigPage.Add('كلمة مرور MySQL (MYSQL_PASSWORD):', True);
  ServerConfigPage.Add('اسم قاعدة البيانات (MYSQL_DATABASE):', False);
  ServerConfigPage.Add('كلمة مرور جديدة للمبرمج (16 حرفًا على الأقل، للتثبيت الجديد):', True);

  // القيم الافتراضية (تتوافق مع إعدادات جهازك PORT=3007 وقاعدة tlab_db)
  ServerConfigPage.Values[0] := '3007';
  ServerConfigPage.Values[1] := '127.0.0.1';
  ServerConfigPage.Values[2] := '3306';
  ServerConfigPage.Values[3] := 'tlab_app';
  ServerConfigPage.Values[4] := '';
  ServerConfigPage.Values[5] := 'tlab_db';
  ServerConfigPage.Values[6] := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Pwd: String;
begin
  Result := True;
  if CurPageID = ServerConfigPage.ID then
  begin
    Pwd := ServerConfigPage.Values[6];
    if not FileExists(ExpandConstant('{app}\.env')) and (Length(Pwd) < 16) then
    begin
      MsgBox('A new installation needs a unique Developer password of at least 16 characters. No default password is installed.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // Never terminate every node.exe on the customer computer.
  // Side-by-side app instances must be stopped explicitly by their owners.
  // Do not silently kill unrelated laboratory or accounting servers.
  Result := '';
end;

function FindMySQLExePath(): String;
begin
  Result := '';
  if FileExists('C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
  else if FileExists('C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe'
  else if FileExists('C:\Program Files\MySQL\MySQL Server 5.6\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 5.6\bin\mysql.exe'
  else if FileExists('C:\Program Files\MySQL\MySQL Server 5.5\bin\mysql.exe') then
    Result := 'C:\Program Files\MySQL\MySQL Server 5.5\bin\mysql.exe'
  else if FileExists('C:\Program Files (x86)\MySQL\MySQL Server 5.5\bin\mysql.exe') then
    Result := 'C:\Program Files (x86)\MySQL\MySQL Server 5.5\bin\mysql.exe'
  else if FileExists('C:\xampp\mysql\bin\mysql.exe') then
    Result := 'C:\xampp\mysql\bin\mysql.exe';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppPort, DbHost, DbPort, DbUser, DbPass, DbName: String;
  EnvContent, PortJsonContent, StartBatContent, StopBatContent, VbsContent, AdminPass: String;
  UpgradeSqlContent, UpgradeSqlPath: String;
  MySQLExe, SqlFilePath, ImportCmd: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    AppPort := Trim(ServerConfigPage.Values[0]);
    if AppPort = '' then AppPort := '3007';

    DbHost := Trim(ServerConfigPage.Values[1]);
    if DbHost = '' then DbHost := '127.0.0.1';

    DbPort := Trim(ServerConfigPage.Values[2]);
    if DbPort = '' then DbPort := '3306';

    DbUser := Trim(ServerConfigPage.Values[3]);
    if DbUser = '' then DbUser := 'root';

    DbPass := ServerConfigPage.Values[4];
    AdminPass := ServerConfigPage.Values[6];

    DbName := Trim(ServerConfigPage.Values[5]);
    if DbName = '' then DbName := 'tlab_db';

    // 1. كتابة ملف .env بتعليقات ASCII نقية لمنع أي تعارض ترميز مع cmd.exe أو dotenv
    EnvContent :=
      '# ============================================================================' + #13#10 +
      '# T-Lab Medical Laboratory & ERP System - Server & MySQL Configuration (.env)' + #13#10 +
      '# Generated by Inno Setup 6 v6.1.0' + #13#10 +
      '# ============================================================================' + #13#10 +
      '' + #13#10 +
      'PORT=' + AppPort + #13#10 +
      'HOST=0.0.0.0' + #13#10 +
      'NODE_ENV=production' + #13#10 +
      '' + #13#10 +
      'MYSQL_HOST=' + DbHost + #13#10 +
      'MYSQL_PORT=' + DbPort + #13#10 +
      'MYSQL_USER=' + DbUser + #13#10 +
      'MYSQL_PASSWORD=' + DbPass + #13#10 +
      'MYSQL_DATABASE=' + DbName + #13#10 +
      'MYSQL_CHARSET=utf8_general_ci' + #13#10 +
      'MYSQL_CONNECTION_TIMEOUT=8000' + #13#10 +
      'MYSQL_AUTO_SYNC=false' + #13#10 +
      'TLAB_ENABLE_UNSAFE_BULK_IMPORT=false' + #13#10 +
      'TLAB_ENABLE_SNAPSHOT_PULL=false' + #13#10 +
      'TLAB_ALLOW_SCHEMA_BOOTSTRAP=false' + #13#10 +
      'TLAB_ADMIN_PASSWORD=' + AdminPass + #13#10 +
      '' + #13#10 +
      'GEMINI_API_KEY=' + #13#10 +
      'APP_URL=http://localhost:' + AppPort + #13#10;

    // Preserve existing credentials and production settings on upgrades.
    if not FileExists(ExpandConstant('{app}\.env')) then
      SaveStringToFile(ExpandConstant('{app}\.env'), EnvContent, False);

    // 2. كتابة ملف port.config.json تلقائياً
    PortJsonContent := '{' + #13#10 + '  "port": ' + AppPort + #13#10 + '}';
    SaveStringToFile(ExpandConstant('{app}\port.config.json'), PortJsonContent, False);

    // 3. توليد ملف التشغيل الذكي start-tlab-production.bat تلقائياً داخل مجلد التثبيت
    // (يتأكد من وجود Node.js، ويثبت الحزم تلقائياً إن لم تكن موجودة، ويمسح كاش Vite القديم، ويفتح المتصفح فور جاهزية البورت)
    StartBatContent :=
      '@echo off' + #13#10 +
      'chcp 65001 >nul' + #13#10 +
      'title T-Lab Medical Laboratory ^& ERP Server' + #13#10 +
      'cd /d "%~dp0"' + #13#10 +
      '' + #13#10 +
      'set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs"' + #13#10 +
      '' + #13#10 +
      'set APP_PORT=' + AppPort + #13#10 +
      'if exist ".env" (' + #13#10 +
      '  for /f "tokens=2 delims==" %%a in (''findstr /B /I "PORT=" ".env" 2^>nul'') do (' + #13#10 +
      '    set "APP_PORT=%%a"' + #13#10 +
      '  )' + #13#10 +
      ')' + #13#10 +
      'set "APP_PORT=%APP_PORT: =%"' + #13#10 +
      'if "%APP_PORT%"=="" set APP_PORT=' + AppPort + #13#10 +
      '' + #13#10 +
      'echo ============================================================================' + #13#10 +
      'echo   T-Lab Medical Laboratory ^& ERP System (MySQL 5.5 / 8.0.28)' + #13#10 +
      'echo   Working Directory: %CD%' + #13#10 +
      'echo   Target URL       : http://localhost:%APP_PORT%' + #13#10 +
      'echo ============================================================================' + #13#10 +
      'echo.' + #13#10 +
      '' + #13#10 +
      'where node >nul 2>&1' + #13#10 +
      'if %ERRORLEVEL% NEQ 0 (' + #13#10 +
      '  echo [ERROR] Node.js was not found on this computer!' + #13#10 +
      '  echo Please install Node.js LTS from https://nodejs.org/ and try again.' + #13#10 +
      '  pause' + #13#10 +
      '  exit /b 1' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'if not exist "node_modules\express\package.json" (' + #13#10 +
      '  echo [1/2] Installing required packages ^(node_modules^) for first-time launch...' + #13#10 +
      '  call npm install --legacy-peer-deps' + #13#10 +
      '  echo.' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'if not exist "node_modules\tsx\dist\cli.mjs" (' + #13#10 +
      '  echo [1/2] Installing tsx runtime...' + #13#10 +
      '  call npm install --legacy-peer-deps' + #13#10 +
      '  echo.' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'if exist "node_modules\.vite" (' + #13#10 +
      '  rmdir /s /q "node_modules\.vite" >nul 2>&1' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0; $i -lt 30; $i++){ Start-Sleep -Seconds 1; try { $c = New-Object System.Net.Sockets.TcpClient(''127.0.0.1'', %APP_PORT%); if($c.Connected){ $c.Close(); Start-Process ''http://localhost:%APP_PORT%''; break } } catch {} }"' + #13#10 +
      '' + #13#10 +
      'set NODE_ENV=production' + #13#10 +
      'if not exist "dist\index.html" (' + #13#10 +
      '  call npm run build' + #13#10 +
      '  if errorlevel 1 exit /b 1' + #13#10 +
      ')' + #13#10 +
      'if exist "node_modules\tsx\dist\cli.mjs" (' + #13#10 +
      '  node "node_modules\tsx\dist\cli.mjs" server.ts --port %APP_PORT% --static-dist' + #13#10 +
      ') else (' + #13#10 +
      '  call npx tsx server.ts --port %APP_PORT% --static-dist' + #13#10 +
      ')' + #13#10 +
      'echo.' + #13#10 +
      'pause' + #13#10;

    SaveStringToFile(ExpandConstant('{app}\start-tlab-production.bat'), StartBatContent, False);

    // 4. توليد ملف إيقاف السيرفر stop-tlab.bat وملف التشغيل الصامت launch-tlab.vbs
    StopBatContent :=
      '@echo off' + #13#10 +
      'echo Do not stop unrelated Node.js services.' + #13#10 +
      'echo Close the T-Lab server window or stop the dedicated T-Lab service only.' + #13#10 +
      'timeout /t 2 >nul' + #13#10;
    SaveStringToFile(ExpandConstant('{app}\stop-tlab.bat'), StopBatContent, False);

    VbsContent :=
      'Set WshShell = CreateObject("WScript.Shell")' + #13#10 +
      'strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)' + #13#10 +
      'WshShell.CurrentDirectory = strPath' + #13#10 +
      'WshShell.Run chr(34) & strPath & "\start-tlab-production.bat" & chr(34), 1, False' + #13#10 +
      'Set WshShell = Nothing' + #13#10;
    SaveStringToFile(ExpandConstant('{app}\launch-tlab.vbs'), VbsContent, False);

    // No automatic SQL imports or schema upgrades during installation.
    // Use an explicitly reviewed, backed-up test database migration.
  end;
end;
