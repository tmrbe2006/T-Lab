; =============================================================================
; T-Lab Medical Laboratory & ERP System - Inno Setup 6 Installer Script (v6.0.0)
; متوافق مع برنامج Inno Setup 6 (الإصدار 6.0 وما بعده)
; طريقة التجميع (Compile):
;   1. شغل ملف build-installer.bat (أسهل طريقة بضغطة واحدة)
;   أو:
;   2. افتح هذا الملف (tlab-setup.iss) ببرنامج Inno Setup Compiler 6 واضغط Build -> Compile (Ctrl+F9)
; =============================================================================

#define MyAppName "T-Lab Medical Laboratory System"
#define MyAppNameAr "نظام إدارة معمل التحاليل الطبية العالمي T-Lab"
#define MyAppVersion "6.0.0"
#define MyAppPublisher "T-Lab Medical Systems"
#define MyAppURL "http://localhost:3007"
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
CloseApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon} (إنشاء اختصار لنظام المعمل T-Lab على سطح المكتب)"; GroupDescription: "{cm:AdditionalIcons}"
Name: "importdb_keep"; Description: "الاحتفاظ بقاعدة البيانات الحالية (tlab_db) كما هي مع ترقية الجداول الجديدة تلقائياً (Lab-to-Lab + المضادات الحيوية)"; GroupDescription: "إعداد قاعدة بيانات MySQL (5.5 / 8.0.28):"; Flags: exclusive
Name: "importdb_full"; Description: "استيراد قاعدة البيانات المرجعية الكاملة من الصفر (39 جدول + 106 تحليل + 414 بارامتر + المضادات الحيوية + Lab-to-Lab)"; GroupDescription: "إعداد قاعدة بيانات MySQL (5.5 / 8.0.28):"; Flags: exclusive unchecked
Name: "importdb_clean"; Description: "استيراد قاعدة بيانات تشغيلية فارغة بدون حركات تجريبية (مع الاحتفاظ بالمستخدمين والتحاليل والبارامترات والمضادات الحيوية)"; GroupDescription: "إعداد قاعدة بيانات MySQL (5.5 / 8.0.28):"; Flags: exclusive unchecked

[InstallDelete]
; حذف أي نسخة قديمة من مجلد البناء المؤقت لضمان تشغيل أحدث كود ومزامنة MySQL فوراً
Type: filesandordirs; Name: "{app}\dist"

[Files]
; نسخ ملفات المشروع الأساسية بالكامل مع استثناء مجلدات البناء المؤقتة
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "Output\*,dist\*,dist-installer\*,.git\*,coverage\*,*.iss"

[Icons]
; اختصار قائمة ابدأ (Start Menu)
Name: "{group}\{#MyAppName} (تشغيل النظام)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\تشغيل النظام في الخلفية (Silent Launcher)"; Filename: "{app}\launch-tlab.vbs"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\تغيير بورت التشغيل (Select Port)"; Filename: "{app}\start-windows.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 21
Name: "{group}\إيقاف السيرفر (Stop T-Lab Server)"; Filename: "{app}\stop-tlab.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 27
Name: "{group}\سكريبت قاعدة البيانات الكاملة (SQL v7)"; Filename: "{app}\public\tlab_db_complete_v7.sql"; WorkingDir: "{app}\public"
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

  // القيم الافتراضية (تتوافق مع إعدادات جهازك PORT=3007 وقاعدة tlab_db)
  ServerConfigPage.Values[0] := '3007';
  ServerConfigPage.Values[1] := '127.0.0.1';
  ServerConfigPage.Values[2] := '3306';
  ServerConfigPage.Values[3] := 'root';
  ServerConfigPage.Values[4] := 'root';
  ServerConfigPage.Values[5] := 'tlab_db';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // إيقاف أي سيرفر قديم يعمل في الخلفية قبل نسخ الملفات الجديدة
  Exec('cmd.exe', '/c taskkill /F /IM node.exe /T >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
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
  EnvContent, PortJsonContent, UpgradeSqlContent, UpgradeSqlPath: String;
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

    DbName := Trim(ServerConfigPage.Values[5]);
    if DbName = '' then DbName := 'tlab_db';

    // 1. كتابة ملف .env تلقائياً (مع NODE_ENV=development لضمان القراءة الفورية بدون كاش قديم)
    EnvContent :=
      '# ============================================================================' + #13#10 +
      '# T-Lab Medical Laboratory & ERP System - Server & MySQL Configuration (.env)' + #13#10 +
      '# Generated by Inno Setup 6 v6.0.0' + #13#10 +
      '# ============================================================================' + #13#10 +
      '' + #13#10 +
      '# 1. إعدادات سيرفر البرنامج (Application Server Settings)' + #13#10 +
      'PORT=' + AppPort + #13#10 +
      'HOST=0.0.0.0' + #13#10 +
      'NODE_ENV=development' + #13#10 +
      '' + #13#10 +
      '# 2. إعدادات سيرفر قاعدة بيانات MySQL (MySQL 5.5 / MySQL 8.0.28 Server Settings)' + #13#10 +
      'MYSQL_HOST=' + DbHost + #13#10 +
      'MYSQL_PORT=' + DbPort + #13#10 +
      'MYSQL_USER=' + DbUser + #13#10 +
      'MYSQL_PASSWORD=' + DbPass + #13#10 +
      'MYSQL_DATABASE=' + DbName + #13#10 +
      'MYSQL_CHARSET=utf8_general_ci' + #13#10 +
      'MYSQL_CONNECTION_TIMEOUT=8000' + #13#10 +
      '' + #13#10 +
      '# 3. إعدادات المزامنة التلقائية مع MySQL (Auto-Sync Settings)' + #13#10 +
      'MYSQL_AUTO_SYNC=true' + #13#10 +
      '' + #13#10 +
      '# 4. إعدادات إضافية اختيارية (Optional External Integrations)' + #13#10 +
      'GEMINI_API_KEY=' + #13#10 +
      'APP_URL=http://localhost:' + AppPort + #13#10;

    SaveStringToFile(ExpandConstant('{app}\.env'), EnvContent, False);

    // 2. كتابة ملف port.config.json تلقائياً
    PortJsonContent := '{' + #13#10 + '  "port": ' + AppPort + #13#10 + '}';
    SaveStringToFile(ExpandConstant('{app}\port.config.json'), PortJsonContent, False);

    // 3. استيراد قاعدة البيانات إلى MySQL إذا اختار المستخدم الاستيراد الكامل أو الفارغ
    MySQLExe := FindMySQLExePath();
    SqlFilePath := '';
    if WizardIsTaskSelected('importdb_full') then
      SqlFilePath := ExpandConstant('{app}\public\tlab_db_complete_v7.sql')
    else if WizardIsTaskSelected('importdb_clean') then
      SqlFilePath := ExpandConstant('{app}\tlab_empty_except_users.sql');

    if (SqlFilePath <> '') and (MySQLExe <> '') then
    begin
      if DbPass <> '' then
        ImportCmd := '/c ""' + MySQLExe + '" --default-character-set=utf8 -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' -p' + DbPass + ' < "' + SqlFilePath + '""'
      else
        ImportCmd := '/c ""' + MySQLExe + '" --default-character-set=utf8 -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' < "' + SqlFilePath + '""';

      Exec('cmd.exe', ImportCmd, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;

    // 4. ترقية الجداول الجديدة تلقائياً (reference_lab_partners و lab_to_lab_dispatches) حتى مع الاحتفاظ بقاعدة البيانات الحالية
    if MySQLExe <> '' then
    begin
      UpgradeSqlPath := ExpandConstant('{app}\upgrade_v6_lab_to_lab.sql');
      UpgradeSqlContent :=
        'CREATE DATABASE IF NOT EXISTS `' + DbName + '` CHARACTER SET utf8 COLLATE utf8_general_ci;' + #13#10 +
        'USE `' + DbName + '`;' + #13#10 +
        'CREATE TABLE IF NOT EXISTS `reference_lab_partners` (' + #13#10 +
        '  `id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `code` VARCHAR(50) NOT NULL,' + #13#10 +
        '  `name_ar` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `name_en` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `contact_person` VARCHAR(150) NOT NULL DEFAULT '''',' + #13#10 +
        '  `phone` VARCHAR(40) NOT NULL DEFAULT '''',' + #13#10 +
        '  `whatsapp_phone` VARCHAR(40) NOT NULL DEFAULT '''',' + #13#10 +
        '  `address` VARCHAR(255) NOT NULL DEFAULT '''',' + #13#10 +
        '  `specialty_notes` VARCHAR(255) NOT NULL DEFAULT '''',' + #13#10 +
        '  `discount_percent` DECIMAL(6,2) NOT NULL DEFAULT 0.00,' + #13#10 +
        '  `default_tat_hours` INT NOT NULL DEFAULT 24,' + #13#10 +
        '  `active` TINYINT(1) NOT NULL DEFAULT 1,' + #13#10 +
        '  `created_at` VARCHAR(40) NOT NULL,' + #13#10 +
        '  PRIMARY KEY (`id`),' + #13#10 +
        '  KEY `idx_ref_lab_code` (`code`)' + #13#10 +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;' + #13#10 +
        'CREATE TABLE IF NOT EXISTS `lab_to_lab_dispatches` (' + #13#10 +
        '  `id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `dispatch_number` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `sample_id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `sample_barcode` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `request_id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `request_number` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `patient_id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `patient_name` VARCHAR(150) NOT NULL,' + #13#10 +
        '  `test_id` VARCHAR(64) NOT NULL DEFAULT '''',' + #13#10 +
        '  `test_name_ar` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `test_name_en` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `sample_type` VARCHAR(100) NOT NULL DEFAULT '''',' + #13#10 +
        '  `tube_color` VARCHAR(100) NOT NULL DEFAULT '''',' + #13#10 +
        '  `reference_lab_id` VARCHAR(64) NOT NULL,' + #13#10 +
        '  `reference_lab_name_ar` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `reference_lab_name_en` VARCHAR(200) NOT NULL,' + #13#10 +
        '  `reference_lab_phone` VARCHAR(40) NOT NULL DEFAULT '''',' + #13#10 +
        '  `courier_name` VARCHAR(150) NOT NULL DEFAULT '''',' + #13#10 +
        '  `courier_phone` VARCHAR(40) NOT NULL DEFAULT '''',' + #13#10 +
        '  `storage_condition` VARCHAR(30) NOT NULL DEFAULT ''refrigerated_2_8'',' + #13#10 +
        '  `outsource_cost` DECIMAL(12,2) NOT NULL DEFAULT 0.00,' + #13#10 +
        '  `patient_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,' + #13#10 +
        '  `dispatch_date` VARCHAR(20) NOT NULL,' + #13#10 +
        '  `expected_result_date` VARCHAR(20) NOT NULL DEFAULT '''',' + #13#10 +
        '  `dispatched_at` VARCHAR(40) DEFAULT NULL,' + #13#10 +
        '  `received_by_partner_at` VARCHAR(40) DEFAULT NULL,' + #13#10 +
        '  `result_received_at` VARCHAR(40) DEFAULT NULL,' + #13#10 +
        '  `status` VARCHAR(40) NOT NULL DEFAULT ''prepared'',' + #13#10 +
        '  `result_summary` TEXT,' + #13#10 +
        '  `report_image_data_url` LONGTEXT,' + #13#10 +
        '  `notes` TEXT,' + #13#10 +
        '  `created_by` VARCHAR(100) NOT NULL DEFAULT '''',' + #13#10 +
        '  `created_at` VARCHAR(40) NOT NULL,' + #13#10 +
        '  PRIMARY KEY (`id`),' + #13#10 +
        '  KEY `idx_l2l_number` (`dispatch_number`),' + #13#10 +
        '  KEY `idx_l2l_barcode` (`sample_barcode`),' + #13#10 +
        '  KEY `idx_l2l_partner` (`reference_lab_id`),' + #13#10 +
        '  KEY `idx_l2l_status` (`status`)' + #13#10 +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;' + #13#10;

      SaveStringToFile(UpgradeSqlPath, UpgradeSqlContent, False);

      if DbPass <> '' then
        ImportCmd := '/c ""' + MySQLExe + '" --default-character-set=utf8 -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' -p' + DbPass + ' < "' + UpgradeSqlPath + '""'
      else
        ImportCmd := '/c ""' + MySQLExe + '" --default-character-set=utf8 -h ' + DbHost + ' -P ' + DbPort + ' -u ' + DbUser + ' < "' + UpgradeSqlPath + '""';

      Exec('cmd.exe', ImportCmd, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
