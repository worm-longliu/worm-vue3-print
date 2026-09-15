// 主进程 ↔ 配置窗口 IPC 通道（main 与 preload 共用常量）。
export const SETTINGS_IPC = {
  GET_STATE: 'worm:settings:get-state',
  SAVE_CONFIG: 'worm:settings:save-config',
  LIST_PRINTERS: 'worm:settings:list-printers',
  TEST_PRINT: 'worm:settings:test-print',
  LIST_HISTORY: 'worm:settings:list-history',
  OPEN_PDF_DIR: 'worm:settings:open-pdf-dir',
  PICK_PDF_DIR: 'worm:settings:pick-pdf-dir',
  OPEN_PDF_FILE: 'worm:settings:open-pdf-file',
  LOG_EVENT: 'worm:settings:log-event',
  JOB_EVENT: 'worm:settings:job-event',
} as const
