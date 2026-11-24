#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub const fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self {
            left,
            top,
            right,
            bottom,
        }
    }

    fn width(self) -> i32 {
        self.right - self.left
    }

    fn height(self) -> i32 {
        self.bottom - self.top
    }

    fn overlaps(self, other: Self) -> bool {
        self.left < other.right
            && self.right > other.left
            && self.top < other.bottom
            && self.bottom > other.top
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

pub fn rect_from_cursor_delta(origin: Rect, origin_cursor: Point, current_cursor: Point) -> Rect {
    let dx = current_cursor.x - origin_cursor.x;
    let dy = current_cursor.y - origin_cursor.y;
    Rect::new(
        origin.left + dx,
        origin.top + dy,
        origin.right + dx,
        origin.bottom + dy,
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResizeEdge {
    Left,
    Right,
    Top,
    Bottom,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl ResizeEdge {
    fn moves_left(self) -> bool {
        matches!(self, Self::Left | Self::TopLeft | Self::BottomLeft)
    }

    fn moves_right(self) -> bool {
        matches!(self, Self::Right | Self::TopRight | Self::BottomRight)
    }

    fn moves_top(self) -> bool {
        matches!(self, Self::Top | Self::TopLeft | Self::TopRight)
    }

    fn moves_bottom(self) -> bool {
        matches!(self, Self::Bottom | Self::BottomLeft | Self::BottomRight)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SnapState {
    x: Option<i32>,
    y: Option<i32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SnapAxis {
    X,
    Y,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MoveSnapKind {
    Dock,
    Align,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MoveAnchor {
    axis: SnapAxis,
    position: i32,
    kind: MoveSnapKind,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MoveSnapState {
    dock: Option<MoveAnchor>,
    align: Option<MoveAnchor>,
}

impl MoveSnapState {
    pub fn clear(&mut self) {
        self.dock = None;
        self.align = None;
    }
}

impl SnapState {
    pub fn clear(&mut self) {
        self.x = None;
        self.y = None;
    }
}

pub const MOVE_SNAP_DISTANCE: i32 = 15;
pub const MOVE_RELEASE_DISTANCE: i32 = 20;
pub const RESIZE_SNAP_DISTANCE: i32 = 10;
pub const RESIZE_RELEASE_DISTANCE: i32 = 16;

fn nearest(value: i32, candidates: &[i32], threshold: i32) -> i32 {
    candidates
        .iter()
        .copied()
        .filter_map(|candidate| {
            let distance = (candidate - value).abs();
            (distance <= threshold).then_some((distance, candidate))
        })
        .min_by_key(|(distance, _)| *distance)
        .map_or(value, |(_, candidate)| candidate)
}

fn apply_anchor(
    value: i32,
    candidate: i32,
    anchor: &mut Option<i32>,
    release_distance: i32,
) -> i32 {
    if let Some(current_anchor) = *anchor {
        if (value - current_anchor).abs() <= release_distance {
            return current_anchor;
        }
        *anchor = None;
        return value;
    }
    if candidate != value {
        *anchor = Some(candidate);
    }
    candidate
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MoveCandidate {
    axis: SnapAxis,
    position: i32,
    distance: i32,
    kind: MoveSnapKind,
}

fn ranges_overlap(start: i32, end: i32, peer_start: i32, peer_end: i32) -> bool {
    start < peer_end && end > peer_start
}

fn push_candidate(
    candidates: &mut Vec<MoveCandidate>,
    axis: SnapAxis,
    position: i32,
    current: i32,
    threshold: i32,
    kind: MoveSnapKind,
) {
    let distance = (position - current).abs();
    if distance <= threshold {
        candidates.push(MoveCandidate {
            axis,
            position,
            distance,
            kind,
        });
    }
}

fn move_candidates(current: Rect, peer: Rect, threshold: i32) -> Vec<MoveCandidate> {
    let mut candidates = Vec::with_capacity(8);
    let vertical_overlap = ranges_overlap(current.top, current.bottom, peer.top, peer.bottom);
    let horizontal_overlap = ranges_overlap(current.left, current.right, peer.left, peer.right);

    // 窗口相邻吸附优先。只有尚未穿入对方时才新建吸附，已经吸附后的轻微越界由释放阈值处理。
    if vertical_overlap && current.right <= peer.left {
        push_candidate(
            &mut candidates,
            SnapAxis::X,
            peer.left - current.width(),
            current.left,
            threshold,
            MoveSnapKind::Dock,
        );
    }
    if vertical_overlap && current.left >= peer.right {
        push_candidate(
            &mut candidates,
            SnapAxis::X,
            peer.right,
            current.left,
            threshold,
            MoveSnapKind::Dock,
        );
    }
    if horizontal_overlap && current.bottom <= peer.top {
        push_candidate(
            &mut candidates,
            SnapAxis::Y,
            peer.top - current.height(),
            current.top,
            threshold,
            MoveSnapKind::Dock,
        );
    }
    if horizontal_overlap && current.top >= peer.bottom {
        push_candidate(
            &mut candidates,
            SnapAxis::Y,
            peer.bottom,
            current.top,
            threshold,
            MoveSnapKind::Dock,
        );
    }

    // 重叠时允许用户自由叠放，不主动吸附到对齐线。
    if !current.overlaps(peer) {
        push_candidate(
            &mut candidates,
            SnapAxis::X,
            peer.left,
            current.left,
            threshold,
            MoveSnapKind::Align,
        );
        push_candidate(
            &mut candidates,
            SnapAxis::X,
            peer.right - current.width(),
            current.left,
            threshold,
            MoveSnapKind::Align,
        );
        push_candidate(
            &mut candidates,
            SnapAxis::Y,
            peer.top,
            current.top,
            threshold,
            MoveSnapKind::Align,
        );
        push_candidate(
            &mut candidates,
            SnapAxis::Y,
            peer.bottom - current.height(),
            current.top,
            threshold,
            MoveSnapKind::Align,
        );
    }
    candidates
}

fn nearest_candidate(candidates: &[MoveCandidate], kind: MoveSnapKind) -> Option<MoveCandidate> {
    candidates
        .iter()
        .copied()
        .filter(|candidate| candidate.kind == kind)
        .min_by_key(|candidate| candidate.distance)
}

fn nearest_alignment(
    candidates: &[MoveCandidate],
    excluded_axis: Option<SnapAxis>,
) -> Option<MoveCandidate> {
    candidates
        .iter()
        .copied()
        .filter(|candidate| {
            candidate.kind == MoveSnapKind::Align && Some(candidate.axis) != excluded_axis
        })
        .min_by_key(|candidate| candidate.distance)
}

fn apply_move_anchor(current: Rect, anchor: MoveAnchor) -> Rect {
    match anchor.axis {
        SnapAxis::X => Rect::new(
            anchor.position,
            current.top,
            anchor.position + current.width(),
            current.bottom,
        ),
        SnapAxis::Y => Rect::new(
            current.left,
            anchor.position,
            current.right,
            anchor.position + current.height(),
        ),
    }
}

fn anchor_holds(current: Rect, anchor: MoveAnchor, release_distance: i32) -> bool {
    let current_position = match anchor.axis {
        SnapAxis::X => current.left,
        SnapAxis::Y => current.top,
    };
    (current_position - anchor.position).abs() <= release_distance
}

pub fn snap_moving(
    current: Rect,
    peer: Rect,
    threshold: i32,
    release_distance: i32,
    state: &mut MoveSnapState,
) -> Rect {
    let candidates = move_candidates(current, peer, threshold);
    let mut released = false;

    if state
        .dock
        .is_some_and(|anchor| !anchor_holds(current, anchor, release_distance))
    {
        state.dock = None;
        released = true;
    }
    if state
        .align
        .is_some_and(|anchor| !anchor_holds(current, anchor, release_distance))
    {
        state.align = None;
        released = true;
    }

    // 脱离帧不重新捕获任何新锚点，避免刚挣脱一条线又被相邻线立即拉回。
    if !released {
        if state.dock.is_none() {
            state.dock =
                nearest_candidate(&candidates, MoveSnapKind::Dock).map(|candidate| MoveAnchor {
                    axis: candidate.axis,
                    position: candidate.position,
                    kind: candidate.kind,
                });
        }

        let dock_axis = state.dock.map(|anchor| anchor.axis);
        if state
            .align
            .is_some_and(|anchor| Some(anchor.axis) == dock_axis)
        {
            state.align = None;
        }
        if state.align.is_none() {
            state.align = nearest_alignment(&candidates, dock_axis).map(|candidate| MoveAnchor {
                axis: candidate.axis,
                position: candidate.position,
                kind: candidate.kind,
            });
        }
    }

    let mut result = current;
    if let Some(dock) = state.dock {
        result = apply_move_anchor(result, dock);
    }
    if let Some(align) = state.align {
        result = apply_move_anchor(result, align);
    }
    result
}

fn snap_start_edge(edge: i32, peer: Rect, horizontal: bool, threshold: i32) -> i32 {
    let (peer_start, peer_end) = if horizontal {
        (peer.left, peer.right)
    } else {
        (peer.top, peer.bottom)
    };
    let mut candidates = vec![peer_start];
    if edge >= peer_end && edge - peer_end <= threshold {
        candidates.push(peer_end);
    }
    nearest(edge, &candidates, threshold)
}

fn snap_end_edge(edge: i32, peer: Rect, horizontal: bool, threshold: i32) -> i32 {
    let (peer_start, peer_end) = if horizontal {
        (peer.left, peer.right)
    } else {
        (peer.top, peer.bottom)
    };
    let mut candidates = vec![peer_end];
    if peer_start >= edge && peer_start - edge <= threshold {
        candidates.push(peer_start);
    }
    nearest(edge, &candidates, threshold)
}

pub fn snap_sizing(
    mut current: Rect,
    peer: Rect,
    edge: ResizeEdge,
    threshold: i32,
    release_distance: i32,
    state: &mut SnapState,
) -> Rect {
    if current.overlaps(peer) {
        if edge.moves_left() {
            current.left = apply_anchor(current.left, current.left, &mut state.x, release_distance);
        } else if edge.moves_right() {
            current.right =
                apply_anchor(current.right, current.right, &mut state.x, release_distance);
        } else {
            state.x = None;
        }
        if edge.moves_top() {
            current.top = apply_anchor(current.top, current.top, &mut state.y, release_distance);
        } else if edge.moves_bottom() {
            current.bottom = apply_anchor(
                current.bottom,
                current.bottom,
                &mut state.y,
                release_distance,
            );
        } else {
            state.y = None;
        }
        return current;
    }

    if edge.moves_left() {
        let candidate = snap_start_edge(current.left, peer, true, threshold);
        current.left = apply_anchor(current.left, candidate, &mut state.x, release_distance);
    } else if edge.moves_right() {
        let candidate = snap_end_edge(current.right, peer, true, threshold);
        current.right = apply_anchor(current.right, candidate, &mut state.x, release_distance);
    } else {
        state.x = None;
    }

    if edge.moves_top() {
        let candidate = snap_start_edge(current.top, peer, false, threshold);
        current.top = apply_anchor(current.top, candidate, &mut state.y, release_distance);
    } else if edge.moves_bottom() {
        let candidate = snap_end_edge(current.bottom, peer, false, threshold);
        current.bottom = apply_anchor(current.bottom, candidate, &mut state.y, release_distance);
    } else {
        state.y = None;
    }
    current
}

#[cfg(target_os = "windows")]
mod native {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetWindowRect, IsWindowVisible, WMSZ_BOTTOM, WMSZ_BOTTOMLEFT,
        WMSZ_BOTTOMRIGHT, WMSZ_LEFT, WMSZ_RIGHT, WMSZ_TOP, WMSZ_TOPLEFT, WMSZ_TOPRIGHT,
        WM_ENTERSIZEMOVE, WM_EXITSIZEMOVE, WM_MOVING, WM_NCDESTROY, WM_SIZING, WM_SIZE, WM_STYLECHANGING, WM_NCPAINT, WM_NCACTIVATE, GWL_STYLE, STYLESTRUCT,
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        WS_CAPTION, WS_SYSMENU, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
    };

    use super::{
        rect_from_cursor_delta, snap_moving, snap_sizing, MoveSnapState, Point, Rect, ResizeEdge,
        SnapState, MOVE_RELEASE_DISTANCE, MOVE_SNAP_DISTANCE, RESIZE_RELEASE_DISTANCE,
        RESIZE_SNAP_DISTANCE,
    };

    const SUBCLASS_ID: usize = 0x444D_534E;

    #[derive(Default)]
    struct NativeSnapState {
        corner_radius: Option<i32>,
        move_snap: MoveSnapState,
        resize_snap: SnapState,
        move_origin: Option<MoveOrigin>,
        mode: Option<SnapMode>,
    }

    #[derive(Clone, Copy)]
    struct MoveOrigin {
        cursor: Point,
        rect: Rect,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum SnapMode {
        Moving,
        Sizing,
    }

    fn registry() -> &'static Mutex<HashMap<isize, NativeSnapState>> {
        static REGISTRY: OnceLock<Mutex<HashMap<isize, NativeSnapState>>> = OnceLock::new();
        REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn from_win32(rect: RECT) -> Rect {
        Rect::new(rect.left, rect.top, rect.right, rect.bottom)
    }

    fn write_win32(target: &mut RECT, rect: Rect) {
        target.left = rect.left;
        target.top = rect.top;
        target.right = rect.right;
        target.bottom = rect.bottom;
    }

    fn cursor_position() -> Option<Point> {
        let mut point = POINT::default();
        (unsafe { GetCursorPos(&mut point) } != 0).then(|| Point::new(point.x, point.y))
    }

    fn window_rect(hwnd: HWND) -> Option<Rect> {
        let mut rect = RECT::default();
        (unsafe { GetWindowRect(hwnd, &mut rect) } != 0).then(|| from_win32(rect))
    }

    fn resize_edge(value: usize) -> Option<ResizeEdge> {
        match value as u32 {
            WMSZ_LEFT => Some(ResizeEdge::Left),
            WMSZ_RIGHT => Some(ResizeEdge::Right),
            WMSZ_TOP => Some(ResizeEdge::Top),
            WMSZ_BOTTOM => Some(ResizeEdge::Bottom),
            WMSZ_TOPLEFT => Some(ResizeEdge::TopLeft),
            WMSZ_TOPRIGHT => Some(ResizeEdge::TopRight),
            WMSZ_BOTTOMLEFT => Some(ResizeEdge::BottomLeft),
            WMSZ_BOTTOMRIGHT => Some(ResizeEdge::BottomRight),
            _ => None,
        }
    }

    fn visible_peer(hwnd: HWND, windows: &HashMap<isize, NativeSnapState>) -> Option<Rect> {
        windows.keys().copied().find_map(|raw| {
            if raw == hwnd as isize {
                return None;
            }
            let peer = raw as HWND;
            if unsafe { IsWindowVisible(peer) } == 0 {
                return None;
            }
            let mut rect = RECT::default();
            (unsafe { GetWindowRect(peer, &mut rect) } != 0).then(|| from_win32(rect))
        })
    }

    unsafe extern "system" fn snap_subclass_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        _data: usize,
    ) -> LRESULT {
        match message {
            WM_NCPAINT => return 0,
            WM_NCACTIVATE => return DefSubclassProc(hwnd, message, wparam, -1),
            WM_ENTERSIZEMOVE => {
                if let Ok(mut windows) = registry().lock() {
                    if let Some(state) = windows.get_mut(&(hwnd as isize)) {
                        state.move_snap.clear();
                        state.resize_snap.clear();
                        state.move_origin = cursor_position()
                            .zip(window_rect(hwnd))
                            .map(|(cursor, rect)| MoveOrigin { cursor, rect });
                        state.mode = None;
                    }
                }
            }
            WM_EXITSIZEMOVE => {
                if let Ok(mut windows) = registry().lock() {
                    if let Some(state) = windows.get_mut(&(hwnd as isize)) {
                        state.move_snap.clear();
                        state.resize_snap.clear();
                        state.move_origin = None;
                        state.mode = None;
                    }
                }
            }
            WM_MOVING | WM_SIZING if lparam != 0 => {
                if let Ok(mut windows) = registry().lock() {
                    if let Some(peer) = visible_peer(hwnd, &windows) {
                        if let Some(state) = windows.get_mut(&(hwnd as isize)) {
                            let mode = if message == WM_MOVING {
                                SnapMode::Moving
                            } else {
                                SnapMode::Sizing
                            };
                            if state.mode != Some(mode) {
                                state.move_snap.clear();
                                state.resize_snap.clear();
                                state.mode = Some(mode);
                            }
                            let proposed = &mut *(lparam as *mut RECT);
                            let snapped = if message == WM_MOVING {
                                let current = state
                                    .move_origin
                                    .and_then(|origin| {
                                        cursor_position().map(|cursor| {
                                            rect_from_cursor_delta(
                                                origin.rect,
                                                origin.cursor,
                                                cursor,
                                            )
                                        })
                                    })
                                    .unwrap_or_else(|| from_win32(*proposed));
                                snap_moving(
                                    current,
                                    peer,
                                    MOVE_SNAP_DISTANCE,
                                    MOVE_RELEASE_DISTANCE,
                                    &mut state.move_snap,
                                )
                            } else if let Some(edge) = resize_edge(wparam) {
                                let current = from_win32(*proposed);
                                snap_sizing(
                                    current,
                                    peer,
                                    edge,
                                    RESIZE_SNAP_DISTANCE,
                                    RESIZE_RELEASE_DISTANCE,
                                    &mut state.resize_snap,
                                )
                            } else {
                                from_win32(*proposed)
                            };
                            write_win32(proposed, snapped);
                        }
                    }
                }
            }
            WM_STYLECHANGING if wparam as i32 == GWL_STYLE => {
                let style = &mut *(lparam as *mut STYLESTRUCT);
                style.styleNew &= !(WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
            }
            WM_SIZE => {
                let radius = registry().lock().ok().and_then(|windows| windows.get(&(hwnd as isize)).and_then(|state| state.corner_radius));
                if let Some(radius) = radius { let _ = apply_corner_radius(hwnd, Some(radius)); }
            }
            WM_NCDESTROY => {
                if let Ok(mut windows) = registry().lock() {
                    windows.remove(&(hwnd as isize));
                }
                RemoveWindowSubclass(hwnd, Some(snap_subclass_proc), SUBCLASS_ID);
            }
            _ => {}
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    pub fn install(hwnd: HWND) -> Result<(), String> {
        registry()
            .lock()
            .map_err(|_| ui_text!("backend.window_snap.install2").to_string())?
            .entry(hwnd as isize)
            .or_default();
        let installed =
            unsafe { SetWindowSubclass(hwnd, Some(snap_subclass_proc), SUBCLASS_ID, 0) };
        if installed == 0 {
            registry()
                .lock()
                .ok()
                .map(|mut windows| windows.remove(&(hwnd as isize)));
            return Err(ui_text!("backend.window_snap.install").to_string());
        }
        Ok(())
    }

    fn apply_corner_radius(hwnd: HWND, radius: Option<i32>) -> Result<(), String> {
        unsafe {
            let region = if let Some(radius) = radius.filter(|radius| *radius > 0) {
                let mut rect: RECT = std::mem::zeroed();
                if GetWindowRect(hwnd, &mut rect) == 0 { return Err(ui_text!("backend.window_snap.apply_corner_radius").into()); }
                CreateRoundRectRgn(0, 0, rect.right - rect.left, rect.bottom - rect.top, radius * 2, radius * 2)
            } else { std::ptr::null_mut() };
            if radius.is_some_and(|value| value > 0) && region.is_null() { return Err(ui_text!("backend.window_snap.apply_corner_radius2").into()); }
            if SetWindowRgn(hwnd, region, 1) == 0 {
                if !region.is_null() { DeleteObject(region); }
                return Err(ui_text!("backend.window_snap.apply_corner_radius3").into());
            }
        }
        Ok(())
    }

    #[repr(C)]
    struct AccentPolicy { state: i32, flags: u32, color: u32, animation: u32 }
    #[repr(C)]
    struct CompositionData { attribute: u32, data: *mut std::ffi::c_void, size: usize }

    pub fn set_material(hwnd: HWND, glass: bool, dark: bool, radius: Option<i32>) -> Result<(), String> {
        unsafe {
            // 关闭系统背景层，使着色与圆角由副窗口自身统一控制。
            let disabled: i32 = 1;
            let _ = DwmSetWindowAttribute(hwnd, 38, &disabled as *const _ as _, 4);
            let library = GetModuleHandleW(windows_sys::core::w!("user32.dll"));
            let address = GetProcAddress(library, b"SetWindowCompositionAttribute\0".as_ptr())
                .ok_or_else(|| ui_text!("backend.window_snap.set_material2").to_string())?;
            let apply: unsafe extern "system" fn(HWND, *mut CompositionData) -> i32 = std::mem::transmute(address);
            let mut policy = AccentPolicy { state: if glass { 4 } else { 0 }, flags: 0, color: if glass { if dark { 0x40181414 } else { 0x60ffffff } } else { 0 }, animation: 0 };
            let mut data = CompositionData { attribute: 19, data: &mut policy as *mut _ as _, size: std::mem::size_of::<AccentPolicy>() };
            if apply(hwnd, &mut data) == 0 { return Err(ui_text!("backend.window_snap.set_material").into()); }
        }
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            SetWindowLongPtrW(hwnd, GWL_STYLE, style & !((WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX) as isize));
            SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER);
        }
        apply_corner_radius(hwnd, radius)?;
        registry().lock().map_err(|_| ui_text!("backend.window_snap.set_material3").to_string())?
            .entry(hwnd as isize).or_default().corner_radius = radius;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub fn set_material(hwnd: windows_sys::Win32::Foundation::HWND, glass: bool, dark: bool, radius: Option<i32>) -> Result<(), String> {
    native::set_material(hwnd, glass, dark, radius)
}

#[cfg(target_os = "windows")]
pub fn install_native(hwnd: windows_sys::Win32::Foundation::HWND) -> Result<(), String> {
    native::install(hwnd)
}

#[cfg(not(target_os = "windows"))]
pub fn install_native(_hwnd: isize) -> Result<(), String> {
    Ok(())
}
