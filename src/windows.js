// Список видимых окон Windows (через WinAPI) — Бульк ходит по их верхним краям

const koffi = require("koffi")

const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x80
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const DWMWA_CLOAKED = 14

const SKIP_CLASSES = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "Windows.UI.Core.CoreWindow",
])

function createWindowTracker() {
  const user32 = koffi.load("user32.dll")
  const dwmapi = koffi.load("dwmapi.dll")

  const EnumProc = koffi.proto("bool __stdcall BulkEnumProc(void *hwnd, intptr_t lParam)")
  const EnumWindows = user32.func("bool __stdcall EnumWindows(BulkEnumProc *cb, intptr_t lParam)")
  const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(void *hwnd)")
  const IsIconic = user32.func("bool __stdcall IsIconic(void *hwnd)")
  const GetWindowTextLengthW = user32.func("int __stdcall GetWindowTextLengthW(void *hwnd)")
  const GetWindowLongPtrW = user32.func("intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)")
  const GetClassNameW = user32.func("int __stdcall GetClassNameW(void *hwnd, void *name, int max)")
  const DwmGetWindowAttribute = dwmapi.func(
    "long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, void *value, uint32_t size)"
  )

  const attr = Buffer.alloc(16)
  const cls = Buffer.alloc(512)

  // Окна в порядке z-order: первое в списке — самое верхнее.
  // Координаты в физических пикселях экрана.
  function list(ownHwnd) {
    const out = []
    EnumWindows((hwnd) => {
      try {
        if (koffi.address(hwnd) === ownHwnd) return true
        if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true
        if (GetWindowTextLengthW(hwnd) === 0) return true
        if (Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & WS_EX_TOOLWINDOW) return true

        if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, attr, 4) === 0 && attr.readUInt32LE(0) !== 0) return true

        const n = GetClassNameW(hwnd, cls, 256)
        if (SKIP_CLASSES.has(cls.toString("utf16le", 0, n * 2))) return true

        if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, attr, 16) !== 0) return true
        const left = attr.readInt32LE(0)
        const top = attr.readInt32LE(4)
        const right = attr.readInt32LE(8)
        const bottom = attr.readInt32LE(12)
        if (right - left < 120 || bottom - top < 60) return true

        out.push({ id: String(koffi.address(hwnd)), left, top, right, bottom })
      } catch (e) {
        // окно могло закрыться прямо во время обхода — пропускаем
      }
      return true
    }, 0)
    return out
  }

  return { list }
}

module.exports = { createWindowTracker }
