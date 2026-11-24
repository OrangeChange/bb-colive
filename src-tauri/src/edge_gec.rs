use sha2::{Digest, Sha256};
use std::num::Wrapping;

// Edge v2 wire format and CS64 operations:
// https://github.com/rany2/edge-tts/issues/490#issuecomment-6126621790
// The service hashes this exact prefix followed by the bucketed FILETIME and client token.
pub fn token_at(unix_seconds: i64, client_token: &str) -> String {
    let windows_seconds = unix_seconds + 11_644_473_600;
    let ticks = windows_seconds / 300 * 300 * 10_000_000;
    let data =
        format!("Copyright (C) Microsoft Corporation. All rights reserved.{ticks}{client_token}");
    let digest = Sha256::digest(data.as_bytes());
    let keys = [
        Wrapping(u32::from_le_bytes(digest[0..4].try_into().unwrap()) | 1),
        Wrapping(u32::from_le_bytes(digest[4..8].try_into().unwrap()) | 1),
    ];
    let mut padded = data.into_bytes();
    padded.resize(padded.len().div_ceil(8) * 8, 0);
    let mut swapped_sum = Wrapping(0u32);
    let mut swapped_last = Wrapping(0u32);
    let mut chain = Wrapping(0u32);
    let mut chain_sum = Wrapping(0u32);
    for pair in padded.chunks_exact(8) {
        for index in 0..2 {
            let word = Wrapping(u32::from_le_bytes(
                pair[index * 4..index * 4 + 4].try_into().unwrap(),
            ));
            let key = keys[index];
            let (mix, factor, finish) = if index == 0 {
                (0xEF0569FB, 0x76F50F34, 0xC3EFEA97)
            } else {
                (0xC31713DB, 0x1881CE3C, 0x35BD1EC9)
            };
            let mixed = rotate16(rotate16(word) * Wrapping(mix) + word * key);
            let product = mixed * Wrapping(factor);
            swapped_last = rotate16(product) * Wrapping(finish) + product;
            swapped_sum += swapped_last;

            chain = (chain + word) * key;
            let factors = if index == 0 {
                [0xCF98B111, 0x87085B9F, 0x12CEB96D, 0x257E1D83]
            } else {
                [0xA27416F5, 0xD38396FF, 0x7C932B89, 0xBFA49F69]
            };
            for factor in factors {
                chain = rotate16(chain) * Wrapping(factor);
            }
            chain_sum += chain;
        }
    }
    let cs64 = [(swapped_last ^ chain).0, (swapped_sum ^ chain_sum).0];
    let cs64_hex: String = cs64
        .iter()
        .flat_map(|word| word.to_le_bytes())
        .map(|byte| format!("{byte:02X}"))
        .collect();
    format!("{cs64_hex}-{:X}", digest)
}

fn rotate16(word: Wrapping<u32>) -> Wrapping<u32> {
    Wrapping(word.0.rotate_left(16))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

    #[test]
    fn v2_matches_reference_vectors_and_five_minute_boundary() {
        for (timestamp, expected) in [
            (
                0,
                "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6",
            ),
            (
                1_700_000_000,
                "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2",
            ),
            (
                1_788_889_482,
                "132BDBBF4C5DA2BC-47B2056A505CD71E906AAC317DFA68233B313EE952F6F52BC8C88F84409DBE49",
            ),
            (
                1_788_889_499,
                "132BDBBF4C5DA2BC-47B2056A505CD71E906AAC317DFA68233B313EE952F6F52BC8C88F84409DBE49",
            ),
            (
                1_788_889_500,
                "5712A15588F8EF62-7755D7B62FC5E5901D5D740678A072752037BCBD0076682DD938E9ECEF82FEC4",
            ),
        ] {
            assert_eq!(
                token_at(timestamp, CLIENT_TOKEN),
                expected,
                "timestamp {timestamp}"
            );
        }
    }
}
