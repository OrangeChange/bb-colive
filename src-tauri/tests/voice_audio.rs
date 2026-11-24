use bb_colive_lib::{resolve_audio_device_ids, AudioOutputTarget};

#[test]
fn 相同设备在双输出中只保留一次() {
    let target = AudioOutputTarget {
        scope: "both".to_string(),
        monitor_device_id: Some("host".to_string()),
        stream_device_id: Some("host".to_string()),
    };
    assert_eq!(
        resolve_audio_device_ids(&target),
        vec![Some("host".to_string())]
    );
}

#[test]
fn 未指定设备的双输出只使用一次默认设备() {
    let target = AudioOutputTarget {
        scope: "both".to_string(),
        monitor_device_id: None,
        stream_device_id: None,
    };
    assert_eq!(resolve_audio_device_ids(&target), vec![None]);
}

#[test]
fn 三种输出范围都复用同一设备解析规则() {
    let cases = [
        (
            "host",
            Some("monitor".to_string()),
            Some("stream".to_string()),
            vec![Some("monitor".to_string())],
        ),
        (
            "audience",
            Some("monitor".to_string()),
            Some("stream".to_string()),
            vec![Some("stream".to_string())],
        ),
        (
            "both",
            Some("monitor".to_string()),
            Some("stream".to_string()),
            vec![Some("monitor".to_string()), Some("stream".to_string())],
        ),
    ];

    for (scope, monitor_device_id, stream_device_id, expected) in cases {
        let target = AudioOutputTarget {
            scope: scope.to_string(),
            monitor_device_id,
            stream_device_id,
        };
        assert_eq!(resolve_audio_device_ids(&target), expected, "{scope}");
    }
}

#[test]
fn 双输出缺少一侧设备时保留另一侧的系统默认设备() {
    let target = AudioOutputTarget {
        scope: "both".to_string(),
        monitor_device_id: Some("monitor".to_string()),
        stream_device_id: None,
    };

    assert_eq!(
        resolve_audio_device_ids(&target),
        vec![Some("monitor".to_string()), None]
    );
}
