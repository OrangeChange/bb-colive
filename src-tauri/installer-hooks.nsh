!define MUI_LANGDLL_ALWAYSSHOW

LangString AppLanguageWriteFailed ${LANG_SIMPCHINESE} "无法保存程序语言。请检查数据目录权限后重试。"
LangString AppLanguageWriteFailed ${LANG_TRADCHINESE} "無法儲存程式語言。請檢查資料目錄權限後重試。"
LangString AppLanguageWriteFailed ${LANG_ENGLISH} "Could not save the app language. Check data folder permissions and try again."
LangString AppLanguageWriteFailed ${LANG_JAPANESE} "アプリの言語を保存できません。データフォルダーの権限を確認して再試行してください。"

!macro NSIS_HOOK_POSTINSTALL
  ${IfNot} ${Silent}
  ${AndIf} $UpdateMode <> 1
    Push $0
    Push $1
    StrCpy $0 "zh-CN"
    ${Switch} $LANGUAGE
      ${Case} ${LANG_TRADCHINESE}
        StrCpy $0 "zh-Hant"
        ${Break}
      ${Case} ${LANG_ENGLISH}
        StrCpy $0 "en"
        ${Break}
      ${Case} ${LANG_JAPANESE}
        StrCpy $0 "ja"
        ${Break}
    ${EndSwitch}
    SetShellVarContext current
    ClearErrors
    CreateDirectory "$APPDATA\BB CoLive"
    FileOpen $1 "$APPDATA\BB CoLive\ui-language.json" w
    ${IfNot} ${Errors}
      FileWrite $1 '$\"$0$\"'
      FileClose $1
    ${EndIf}
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "$(AppLanguageWriteFailed)"
      Abort
    ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend

; Only remove new-brand data after the user selects the uninstaller data-removal option.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState == ${BST_CHECKED}
    SetShellVarContext current
    RmDir /r "$APPDATA\BB CoLive"
  ${EndIf}
!macroend
