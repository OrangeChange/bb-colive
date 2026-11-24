use bb_colive_lib::window_snap::{
    rect_from_cursor_delta, snap_moving, snap_sizing, MoveSnapState, Point, Rect, ResizeEdge,
    SnapState, MOVE_RELEASE_DISTANCE, MOVE_SNAP_DISTANCE, RESIZE_RELEASE_DISTANCE,
    RESIZE_SNAP_DISTANCE,
};

#[test]
fn moving_and_resizing_use_independent_fixed_pixel_thresholds() {
    assert_eq!((MOVE_SNAP_DISTANCE, MOVE_RELEASE_DISTANCE), (15, 20));
    assert_eq!((RESIZE_SNAP_DISTANCE, RESIZE_RELEASE_DISTANCE), (10, 16));
}

#[test]
fn moving_window_snaps_adjacent_edge_without_changing_other_axis() {
    let mut state = MoveSnapState::default();
    let current = Rect::new(510, 120, 990, 600);
    let peer = Rect::new(20, 100, 500, 580);

    let result = snap_moving(current, peer, 10, 16, &mut state);

    assert_eq!(result, Rect::new(500, 120, 980, 600));
}

#[test]
fn resizing_only_changes_the_active_edge() {
    let mut state = SnapState::default();
    let current = Rect::new(20, 20, 491, 500);
    let peer = Rect::new(500, 80, 980, 560);

    let result = snap_sizing(current, peer, ResizeEdge::Right, 10, 16, &mut state);

    assert_eq!(result, Rect::new(20, 20, 500, 500));
}

#[test]
fn overlapping_windows_are_not_forced_to_snap() {
    let mut state = MoveSnapState::default();
    let current = Rect::new(490, 120, 970, 600);
    let peer = Rect::new(20, 100, 500, 580);

    assert_eq!(snap_moving(current, peer, 10, 16, &mut state), current);
}

#[test]
fn snapped_axis_releases_after_release_distance() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(20, 100, 500, 580);
    let near = Rect::new(507, 120, 987, 600);
    assert_eq!(snap_moving(near, peer, 10, 16, &mut state).left, 500);

    let dragged_past_release = Rect::new(518, 120, 998, 600);
    assert_eq!(
        snap_moving(dragged_past_release, peer, 10, 16, &mut state).left,
        518
    );
}

#[test]
fn adjacent_snap_holds_until_overlap_motion_passes_release_distance() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(500, 100, 980, 580);
    let near = Rect::new(12, 100, 492, 580);
    assert_eq!(snap_moving(near, peer, 10, 16, &mut state).right, 500);

    let one_pixel_overlap = Rect::new(21, 100, 501, 580);
    assert_eq!(
        snap_moving(one_pixel_overlap, peer, 10, 16, &mut state),
        Rect::new(20, 100, 500, 580)
    );

    let pushed_past_release = Rect::new(37, 100, 517, 580);
    assert_eq!(
        snap_moving(pushed_past_release, peer, 10, 16, &mut state),
        pushed_past_release
    );
}

#[test]
fn vertical_dock_keeps_horizontal_movement_free() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(0, 0, 480, 480);

    assert_eq!(
        snap_moving(Rect::new(0, 485, 480, 965), peer, 10, 16, &mut state),
        Rect::new(0, 480, 480, 960)
    );
    assert_eq!(
        snap_moving(Rect::new(-30, 482, 450, 962), peer, 10, 16, &mut state),
        Rect::new(-30, 480, 450, 960)
    );
}

#[test]
fn vertical_dock_can_add_and_release_horizontal_edge_alignment() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(0, 0, 480, 480);

    assert_eq!(
        snap_moving(Rect::new(30, 488, 510, 968), peer, 15, 20, &mut state),
        Rect::new(30, 480, 510, 960)
    );
    assert_eq!(
        snap_moving(Rect::new(12, 488, 492, 968), peer, 15, 20, &mut state),
        Rect::new(0, 480, 480, 960)
    );
    assert_eq!(
        snap_moving(Rect::new(21, 488, 501, 968), peer, 15, 20, &mut state),
        Rect::new(21, 480, 501, 960)
    );
}

#[test]
fn horizontal_dock_keeps_vertical_movement_free() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(0, 0, 480, 480);

    assert_eq!(
        snap_moving(Rect::new(485, 0, 965, 480), peer, 10, 16, &mut state),
        Rect::new(480, 0, 960, 480)
    );
    assert_eq!(
        snap_moving(Rect::new(482, 25, 962, 505), peer, 10, 16, &mut state),
        Rect::new(480, 25, 960, 505)
    );
}

#[test]
fn cumulative_cursor_intent_releases_a_dock() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(0, 0, 480, 480);

    assert_eq!(
        snap_moving(Rect::new(0, 485, 480, 965), peer, 10, 16, &mut state).top,
        480
    );
    assert_eq!(
        snap_moving(Rect::new(0, 496, 480, 976), peer, 10, 16, &mut state).top,
        480
    );
    assert_eq!(
        snap_moving(Rect::new(0, 497, 480, 977), peer, 10, 16, &mut state).top,
        497
    );
}

#[test]
fn cursor_delta_uses_drag_origin_instead_of_previous_snapped_rect() {
    assert_eq!(
        rect_from_cursor_delta(
            Rect::new(0, 0, 480, 480),
            Point::new(100, 100),
            Point::new(111, 97)
        ),
        Rect::new(11, -3, 491, 477)
    );
}

#[test]
fn docking_replaces_alignment_when_windows_reach_each_other() {
    let mut state = MoveSnapState::default();
    let peer = Rect::new(0, 0, 480, 480);

    assert_eq!(
        snap_moving(Rect::new(4, 500, 484, 980), peer, 10, 16, &mut state).left,
        0
    );
    assert_eq!(
        snap_moving(Rect::new(4, 488, 484, 968), peer, 10, 16, &mut state).top,
        480
    );
    assert_eq!(
        snap_moving(Rect::new(-20, 482, 460, 962), peer, 10, 16, &mut state),
        Rect::new(-20, 480, 460, 960)
    );
}
