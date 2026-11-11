use kiso_ffi::*;

kiso_ffi::kiso_abi!();

#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

#[no_mangle]
pub extern "C" fn scale(x: f64, k: f64) -> f64 {
    x * k
}

#[no_mangle]
pub extern "C" fn is_even(n: i32) -> i32 {
    (n % 2 == 0) as i32
}

#[no_mangle]
pub extern "C" fn concat(ap: i32, al: i32, bp: i32, bl: i32) -> i64 {
    let (a, b) = unsafe { (str_arg(ap as u32, al as u32), str_arg(bp as u32, bl as u32)) };
    pack_str(&(a + &b))
}

#[no_mangle]
pub extern "C" fn upper(p: i32, l: i32) -> i64 {
    pack_str(&unsafe { str_arg(p as u32, l as u32) }.to_uppercase())
}

#[no_mangle]
pub extern "C" fn sum_f64s(p: i32, n: i32) -> f64 {
    unsafe { f64_arg(p as u32, n as u32) }.iter().sum()
}

#[no_mangle]
pub extern "C" fn scale_f64s(p: i32, n: i32, k: f64) -> i64 {
    let v: Vec<f64> = unsafe { f64_arg(p as u32, n as u32) }.iter().map(|x| x * k).collect();
    pack_f64s(&v)
}

#[no_mangle]
pub extern "C" fn sum_i32s(p: i32, n: i32) -> i32 {
    unsafe { i32_arg(p as u32, n as u32) }.iter().fold(0i32, |a, b| a.wrapping_add(*b))
}

#[no_mangle]
pub extern "C" fn echo_bytes(p: i32, l: i32) -> i64 {
    pack_bytes(unsafe { bytes(p as u32, l as u32) }.to_vec())
}

#[no_mangle]
pub extern "C" fn fail_always() -> i64 {
    fail("fixture failure")
}

#[no_mangle]
pub extern "C" fn rev_i32s(p: i32, n: i32) -> i64 {
    let mut v = unsafe { i32_arg(p as u32, n as u32) };
    v.reverse();
    pack_i32s(&v)
}

#[no_mangle]
pub extern "C" fn mean_and_max(p: i32, n: i32) -> i64 {
    let v = unsafe { f64_arg(p as u32, n as u32) };
    if v.is_empty() {
        return fail("empty input");
    }
    let max = v.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    pack_f64s(&[v.iter().sum::<f64>() / v.len() as f64, max])
}

#[no_mangle]
pub extern "C" fn edn_echo(p: i32, l: i32) -> i64 {
    unsafe { edn_roundtrip(p as u32, l as u32) }
}

/// `{:xs [numbers]}` -> `{:count n, :sum s, :max m}` (the max is nil for an empty list).
#[no_mangle]
pub extern "C" fn edn_stats(p: i32, l: i32) -> i64 {
    let input = match edn::parse(&unsafe { str_arg(p as u32, l as u32) }) {
        Ok(v) => v,
        Err(e) => return fail(e),
    };
    let Some(xs) = input.get("xs").and_then(Edn::items) else {
        return fail("expected {:xs [...]}");
    };
    let nums: Vec<f64> = xs.iter().filter_map(Edn::as_f64).collect();
    let max = nums.iter().cloned().fold(None, |m: Option<f64>, x| Some(m.map_or(x, |m| m.max(x))));
    let out = Edn::Map(vec![
        (Edn::kw("count"), Edn::Int(nums.len() as i64)),
        (Edn::kw("sum"), Edn::Float(nums.iter().sum())),
        (Edn::kw("max"), max.map_or(Edn::Nil, Edn::Float)),
    ]);
    pack_str(&edn::to_string(&out))
}
