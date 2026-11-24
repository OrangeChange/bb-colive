; Only remove new-brand data after the user selects the uninstaller data-removal option.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState == ${BST_CHECKED}
    SetShellVarContext current
    RmDir /r "$APPDATA\BB CoLive"
  ${EndIf}
!macroend
