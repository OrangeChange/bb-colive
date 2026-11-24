// Prevents an additional console window on Windows in both debug and release.
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    bb_colive_lib::run()
}
