use std::ffi::{c_char, c_void, CStr};

unsafe extern "C" {
    fn danmu_glass_set(hwnd: *mut c_void, enabled: i32, dark: i32, radius: f32,
        tint: f32, color: *const f32, error: *mut c_char, capacity: usize) -> i32;
}

pub fn set(hwnd: *mut c_void, enabled: bool, dark: bool, radius: f32, tint: f32, color: Option<[f32; 4]>) -> Result<(), String> {
    let mut error = [0 as c_char; 256];
    let result = unsafe { danmu_glass_set(hwnd, enabled as i32, dark as i32, radius,
        tint, color.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()), error.as_mut_ptr(), error.len()) };
    if result == 0 {
        Err(ui_format!("backend.liquid_glass.set", unsafe { CStr::from_ptr(error.as_ptr()) }.to_string_lossy()))
    } else { Ok(()) }
}
