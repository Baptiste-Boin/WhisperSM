//! Best-effort detection of the application the user is dictating into.
//!
//! The name is stored with each history entry so the Home screen can count
//! how many apps WhisperSM was used in. Every platform path is optional:
//! when detection fails the entry simply has no app name.

/// Name of the frontmost (focused) application, if it can be determined.
pub fn frontmost_app_name() -> Option<String> {
    let name = platform::frontmost_app_name()?;
    let name = name.trim();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use core_foundation::{
        base::{CFType, TCFType},
        dictionary::CFDictionary,
        number::CFNumber,
        string::CFString,
    };
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
        kCGWindowListOptionOnScreenOnly, kCGWindowOwnerName,
    };

    /// The owner of the first on-screen window at the normal window layer is
    /// the frontmost application (the list is ordered front to back).
    pub fn frontmost_app_name() -> Option<String> {
        let window_infos = copy_window_info(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID,
        )?;

        let layer_key = unsafe { CFString::wrap_under_get_rule(kCGWindowLayer) };
        let owner_key = unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerName) };

        for window_info_ref in window_infos.get_all_values() {
            let window_info = unsafe {
                CFDictionary::<CFString, CFType>::wrap_under_get_rule(
                    window_info_ref as core_foundation::dictionary::CFDictionaryRef,
                )
            };

            let layer = window_info
                .find(&layer_key)
                .and_then(|value| value.downcast::<CFNumber>())
                .and_then(|value| value.to_i32());
            if layer != Some(0) {
                continue;
            }

            let owner = window_info
                .find(&owner_key)
                .and_then(|value| value.downcast::<CFString>())
                .map(|value| value.to_string());
            if let Some(owner) = owner {
                if !owner.is_empty() {
                    return Some(owner);
                }
            }
        }

        None
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    /// Executable name (without extension) of the foreground window's process.
    pub fn frontmost_app_name() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buffer = [0u16; 1024];
            let mut length = buffer.len() as u32;
            let result = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            );
            let _ = CloseHandle(handle);
            result.ok()?;
            let path = String::from_utf16_lossy(&buffer[..length as usize]);
            std::path::Path::new(&path)
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::process::Command;

    /// Uses `xdotool` when it is installed (X11 or XWayland). Wayland
    /// compositors do not expose the active window to unprivileged apps.
    pub fn frontmost_app_name() -> Option<String> {
        let output = Command::new("xdotool")
            .args(["getactivewindow", "getwindowclassname"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn frontmost_app_name() -> Option<String> {
        None
    }
}
