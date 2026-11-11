//! C ABI helpers for wasm modules called from Kiso (see `.dev/design/09-wasm-ffi.md`).
//!
//! A module re-exports the allocator pair with [`kiso_abi!`] and returns variable-length
//! results as a packed `i64` (`(len << 32) | ptr`) produced by the `pack_*` functions.

pub mod edn;

use std::cell::RefCell;
pub use edn::Edn;

/// Pointer used for successful results of length 0 (never dereferenced).
const EMPTY_PTR: u32 = 1;

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Allocates `len` zeroed bytes owned by the caller until `free`.
pub fn alloc(len: usize) -> u32 {
    if len == 0 {
        return 0;
    }
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8 as usize as u32
}

/// Releases a buffer from `alloc` or one of the `pack_*` functions.
///
/// # Safety
/// `ptr`/`len` must come from a previous `alloc`/`pack_*` call and not be freed twice.
pub unsafe fn free(ptr: u32, len: usize) {
    if len == 0 || ptr == 0 || ptr == EMPTY_PTR {
        return;
    }
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr as usize as *mut u8, len)));
}

/// Borrows `len` bytes at `ptr`; an empty slice when `len == 0`.
///
/// # Safety
/// `ptr` must point to `len` readable bytes for the lifetime `'a`.
pub unsafe fn bytes<'a>(ptr: u32, len: u32) -> &'a [u8] {
    if len == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(ptr as usize as *const u8, len as usize)
    }
}

/// Borrows a UTF-8 string argument. Invalid UTF-8 is replaced lossily.
///
/// # Safety
/// Same as [`bytes`].
pub unsafe fn str_arg(ptr: u32, len: u32) -> String {
    String::from_utf8_lossy(bytes(ptr, len)).into_owned()
}

/// Copies `len` little-endian `f64` values at `ptr` (unaligned input is fine).
///
/// # Safety
/// `ptr` must point to `len * 8` readable bytes.
pub unsafe fn f64_arg(ptr: u32, len: u32) -> Vec<f64> {
    bytes(ptr, len * 8).chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect()
}

/// Copies `len` little-endian `i32` values at `ptr`.
///
/// # Safety
/// `ptr` must point to `len * 4` readable bytes.
pub unsafe fn i32_arg(ptr: u32, len: u32) -> Vec<i32> {
    bytes(ptr, len * 4).chunks_exact(4).map(|c| i32::from_le_bytes(c.try_into().unwrap())).collect()
}

/// Packs a result buffer as `(len << 32) | ptr`; ownership moves to the host.
pub fn pack_bytes(v: Vec<u8>) -> i64 {
    let len = v.len();
    if len == 0 {
        return EMPTY_PTR as i64;
    }
    let ptr = Box::into_raw(v.into_boxed_slice()) as *mut u8 as usize as u32;
    ((len as i64) << 32) | ptr as i64
}

pub fn pack_str(s: &str) -> i64 {
    pack_bytes(s.as_bytes().to_vec())
}

/// Parses an EDN string argument and returns it re-printed; `fail`s (packed 0) on invalid input.
///
/// # Safety
/// Same as [`bytes`].
pub unsafe fn edn_roundtrip(ptr: u32, len: u32) -> i64 {
    match edn::parse(&str_arg(ptr, len)) {
        Ok(v) => pack_str(&edn::to_string(&v)),
        Err(e) => fail(e),
    }
}

pub fn pack_f64s(v: &[f64]) -> i64 {
    pack_bytes(v.iter().flat_map(|x| x.to_le_bytes()).collect())
}

pub fn pack_i32s(v: &[i32]) -> i64 {
    pack_bytes(v.iter().flat_map(|x| x.to_le_bytes()).collect())
}

/// Records an error message and returns `0`, the failure value of packed results.
pub fn fail(msg: impl Into<String>) -> i64 {
    LAST_ERROR.with(|e| *e.borrow_mut() = Some(msg.into()));
    0
}

/// Takes the recorded error message as a packed string (`0` when none).
pub fn take_last_error() -> i64 {
    match LAST_ERROR.with(|e| e.borrow_mut().take()) {
        Some(m) => pack_str(&m),
        None => 0,
    }
}

/// Exports `kiso_alloc`, `kiso_free` and `kiso_last_error` from the calling cdylib.
#[macro_export]
macro_rules! kiso_abi {
    () => {
        #[no_mangle]
        pub extern "C" fn kiso_alloc(len: i32) -> i32 {
            $crate::alloc(len as usize) as i32
        }
        #[no_mangle]
        pub extern "C" fn kiso_free(ptr: i32, len: i32) {
            unsafe { $crate::free(ptr as u32, len as usize) }
        }
        #[no_mangle]
        pub extern "C" fn kiso_last_error() -> i64 {
            $crate::take_last_error()
        }
    };
}

// Pointers are 32-bit by design, so tests that dereference them only make sense on
// wasm32; round trips through real wasm are covered by test/kiso/ffi_*_test.cljs.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_result_is_not_a_failure() {
        assert_eq!(pack_str(""), EMPTY_PTR as i64);
        assert_eq!(pack_bytes(vec![]) >> 32, 0);
    }

    #[test]
    fn packed_length_is_in_high_bits() {
        assert_eq!(pack_str("héllo") >> 32, 6);
        assert_eq!(pack_f64s(&[1.0, 2.0]) >> 32, 16);
        assert_eq!(pack_i32s(&[1, 2, 3]) >> 32, 12);
    }

    #[test]
    fn fail_records_error_once() {
        assert_eq!(fail("boom"), 0);
        assert_eq!(take_last_error() >> 32, 4);
        assert_eq!(take_last_error(), 0);
    }

    #[test]
    fn zero_length_alloc_is_null() {
        assert_eq!(alloc(0), 0);
    }
}
