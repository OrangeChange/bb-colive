use crate::cloud_recovery_cache::valid_hash;
use crate::cloud_recovery_transport::{valid_decimal, valid_uuid};
use serde_json::Value;
use std::sync::OnceLock;
static SCHEMA: OnceLock<Value> = OnceLock::new();
pub(crate) fn timestamp(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 24 {
        return false;
    }
    for (i, c) in [
        (4, b'-'),
        (7, b'-'),
        (10, b'T'),
        (13, b':'),
        (16, b':'),
        (19, b'.'),
        (23, b'Z'),
    ] {
        if b[i] != c {
            return false;
        }
    }
    if b.iter()
        .enumerate()
        .any(|(i, b)| ![4, 7, 10, 13, 16, 19, 23].contains(&i) && !b.is_ascii_digit())
    {
        return false;
    }
    let n = |a: usize, z: usize| s[a..z].parse::<u32>().unwrap_or(u32::MAX);
    let y = n(0, 4);
    let m = n(5, 7);
    let d = n(8, 10);
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    d > 0 && d <= days && n(11, 13) < 24 && n(14, 16) < 60 && n(17, 19) < 60
}
fn pattern(p: &str, s: &str) -> bool {
    if p.starts_with("^[a-f0-9]{8}") {
        return valid_uuid(s);
    }
    if p == "^(0|[1-9][0-9]*)$" {
        return valid_decimal(s);
    }
    if p == "^[a-f0-9]{64}$" {
        return valid_hash(s);
    }
    if p.ends_with("Z$") {
        return timestamp(s);
    }
    if p.starts_with("^(?:[A-Za-z0-9+/]") {
        let b = s.as_bytes();
        if b.len() % 4 != 0 {
            return false;
        }
        let padding = b.iter().rev().take_while(|b| **b == b'=').count();
        return padding <= 2
            && b[..b.len() - padding]
                .iter()
                .all(|b| b.is_ascii_alphanumeric() || *b == b'+' || *b == b'/');
    }
    false
}
fn matches(defs: &Value, r: &Value, v: &Value, depth: usize) -> bool {
    if depth > 128 {
        return false;
    }
    if let Some(reference) = r["$ref"].as_str() {
        return matches(
            defs,
            &defs[reference.trim_start_matches("#/$defs/")],
            v,
            depth + 1,
        );
    }
    for key in ["anyOf", "oneOf"] {
        if let Some(a) = r[key].as_array() {
            let n = a.iter().filter(|r| matches(defs, r, v, depth + 1)).count();
            if if key == "oneOf" { n != 1 } else { n == 0 } {
                return false;
            }
        }
    }
    if r.get("const").is_some_and(|x| x != v)
        || r["enum"].as_array().is_some_and(|a| !a.contains(v))
    {
        return false;
    }
    match r["type"].as_str() {
        Some("null") => {
            if !v.is_null() {
                return false;
            }
        }
        Some("boolean") => {
            if !v.is_boolean() {
                return false;
            }
        }
        Some("integer") => {
            let Some(n) = v.as_i64() else {
                return false;
            };
            if n.unsigned_abs() > 9007199254740991
                || r["minimum"].as_i64().is_some_and(|m| n < m)
                || r["maximum"].as_i64().is_some_and(|m| n > m)
            {
                return false;
            }
        }
        Some("string") => {
            let Some(s) = v.as_str() else {
                return false;
            };
            if r["maxLength"]
                .as_u64()
                .is_some_and(|n| s.encode_utf16().count() as u64 > n)
                || r["pattern"].as_str().is_some_and(|p| !pattern(p, s))
            {
                return false;
            }
        }
        Some("array") => {
            let Some(a) = v.as_array() else {
                return false;
            };
            if r["minItems"].as_u64().is_some_and(|n| (a.len() as u64) < n)
                || r["maxItems"].as_u64().is_some_and(|n| (a.len() as u64) > n)
            {
                return false;
            }
            if let Some(item) = r.get("items") {
                if a.iter().any(|v| !matches(defs, item, v, depth + 1)) {
                    return false;
                }
            }
        }
        Some("object") => {
            let Some(o) = v.as_object() else {
                return false;
            };
            if r["required"].as_array().is_some_and(|a| {
                a.iter()
                    .any(|k| k.as_str().is_none_or(|k| !o.contains_key(k)))
            }) {
                return false;
            }
            for (k, v) in o {
                if let Some(rule) = r["properties"].get(k) {
                    if !matches(defs, rule, v, depth + 1) {
                        return false;
                    }
                } else if r["additionalProperties"] == false {
                    return false;
                }
            }
        }
        _ => {}
    }
    true
}
pub(crate) fn validate(definition: &str, value: &Value) -> Result<(), String> {
    let s = SCHEMA.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/cloudSync/recovery-v03.schema.json"))
            .expect("frozen recovery schema")
    });
    let d = s["$defs"].get(definition).ok_or("invalid_schema")?;
    if matches(&s["$defs"], d, value, 0) {
        Ok(())
    } else {
        Err("invalid_schema".into())
    }
}
pub(crate) fn read_line(bytes: &[u8], definition: &str) -> Result<Value, String> {
    #[cfg(test)]
    if definition == "Fact" {
        FACT_READ_CALLS.with(|c| c.set(c.get() + 1));
    }
    if bytes.is_empty()
        || bytes.len() > 16777216
        || bytes.last() != Some(&10)
        || bytes[..bytes.len() - 1].contains(&10)
        || bytes.contains(&13)
        || bytes.starts_with(&[239, 187, 191])
    {
        return Err("invalid_serialization".into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "invalid_utf8")?;
    let value = serde_json::from_str(text).map_err(|_| "invalid_json")?;
    validate(definition, &value)?;
    Ok(value)
}

#[cfg(test)]
thread_local! { static FACT_READ_CALLS: std::cell::Cell<u64> = const { std::cell::Cell::new(0) }; }
#[cfg(test)]
pub(crate) fn take_fact_read_calls() -> u64 {
    FACT_READ_CALLS.with(|c| c.replace(0))
}
