//! Zero-dependency EDN reader/printer for Kiso FFI payloads (design 09, `:edn` type).
//!
//! Covers the data a ClojureScript `pr-str` produces: nil, booleans, integers (i64), floats,
//! strings, characters, keywords, symbols, lists, vectors, maps (insertion order), sets and
//! tagged literals. `#_` discards and `;` comments are skipped when reading.

use std::fmt::Write;

#[derive(Debug, Clone, PartialEq)]
pub enum Edn {
    Nil,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Char(char),
    /// Without the leading colon, e.g. `a/b`.
    Keyword(String),
    Symbol(String),
    List(Vec<Edn>),
    Vector(Vec<Edn>),
    Map(Vec<(Edn, Edn)>),
    Set(Vec<Edn>),
    Tagged(String, Box<Edn>),
}

impl Edn {
    pub fn kw(name: &str) -> Edn {
        Edn::Keyword(name.to_string())
    }

    /// Looks up a keyword key in a map.
    pub fn get(&self, key: &str) -> Option<&Edn> {
        match self {
            Edn::Map(entries) => entries.iter().find(|(k, _)| matches!(k, Edn::Keyword(n) if n == key)).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Items of a vector, list or set.
    pub fn items(&self) -> Option<&[Edn]> {
        match self {
            Edn::List(v) | Edn::Vector(v) | Edn::Set(v) => Some(v),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Edn::Int(i) => Some(*i as f64),
            Edn::Float(f) => Some(*f),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Edn::Int(i) => Some(*i),
            Edn::Float(f) if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 => Some(*f as i64),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Edn::Str(s) => Some(s),
            _ => None,
        }
    }
}

pub fn parse(input: &str) -> Result<Edn, String> {
    let mut p = Parser { chars: input.chars().collect(), pos: 0 };
    let value = p.value()?.ok_or_else(|| "edn: empty input".to_string())?;
    p.skip_ws();
    if p.pos < p.chars.len() {
        return Err(format!("edn: unexpected trailing input at {}", p.pos));
    }
    Ok(value)
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

fn is_delim(c: char) -> bool {
    c.is_whitespace() || c == ',' || matches!(c, '(' | ')' | '[' | ']' | '{' | '}' | '"' | ';' | '\\')
}

impl Parser {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while let Some(c) = self.peek() {
            if c.is_whitespace() || c == ',' {
                self.pos += 1;
            } else if c == ';' {
                while let Some(c) = self.peek() {
                    self.pos += 1;
                    if c == '\n' {
                        break;
                    }
                }
            } else {
                break;
            }
        }
    }

    /// Next value, or `None` at end of input or before a closing delimiter.
    fn value(&mut self) -> Result<Option<Edn>, String> {
        self.skip_ws();
        let Some(c) = self.peek() else { return Ok(None) };
        match c {
            ')' | ']' | '}' => Ok(None),
            '(' => self.seq(')').map(|v| Some(Edn::List(v))),
            '[' => self.seq(']').map(|v| Some(Edn::Vector(v))),
            '{' => {
                let items = self.seq('}')?;
                if items.len() % 2 != 0 {
                    return Err("edn: map literal must contain an even number of forms".to_string());
                }
                let mut entries = Vec::with_capacity(items.len() / 2);
                let mut it = items.into_iter();
                while let (Some(k), Some(v)) = (it.next(), it.next()) {
                    entries.push((k, v));
                }
                Ok(Some(Edn::Map(entries)))
            }
            '"' => self.string().map(|s| Some(Edn::Str(s))),
            '\\' => self.character().map(|c| Some(Edn::Char(c))),
            '#' => self.dispatch(),
            _ => self.atom().map(Some),
        }
    }

    fn seq(&mut self, close: char) -> Result<Vec<Edn>, String> {
        self.pos += 1;
        let mut out = Vec::new();
        loop {
            if let Some(v) = self.value()? {
                out.push(v);
                continue;
            }
            self.skip_ws();
            return match self.peek() {
                Some(c) if c == close => {
                    self.pos += 1;
                    Ok(out)
                }
                Some(c) => Err(format!("edn: unexpected '{c}' at {}", self.pos)),
                None => Err(format!("edn: missing closing '{close}'")),
            };
        }
    }

    fn dispatch(&mut self) -> Result<Option<Edn>, String> {
        self.pos += 1;
        match self.peek() {
            Some('{') => self.seq('}').map(|v| Some(Edn::Set(v))),
            Some('_') => {
                self.pos += 1;
                self.value()?.ok_or_else(|| "edn: #_ needs a form".to_string())?;
                self.value()
            }
            Some('#') => {
                self.pos += 1;
                match self.token().as_str() {
                    "Inf" => Ok(Some(Edn::Float(f64::INFINITY))),
                    "-Inf" => Ok(Some(Edn::Float(f64::NEG_INFINITY))),
                    "NaN" => Ok(Some(Edn::Float(f64::NAN))),
                    other => Err(format!("edn: unknown symbolic value ##{other}")),
                }
            }
            Some(c) if c.is_alphabetic() => {
                let tag = self.token();
                let value = self.value()?.ok_or_else(|| format!("edn: tag #{tag} needs a form"))?;
                Ok(Some(Edn::Tagged(tag, Box::new(value))))
            }
            _ => Err(format!("edn: invalid dispatch at {}", self.pos)),
        }
    }

    fn token(&mut self) -> String {
        let start = self.pos;
        while let Some(c) = self.peek() {
            if is_delim(c) {
                break;
            }
            self.pos += 1;
        }
        self.chars[start..self.pos].iter().collect()
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1;
        let mut out = String::new();
        loop {
            let c = self.peek().ok_or_else(|| "edn: unterminated string".to_string())?;
            self.pos += 1;
            match c {
                '"' => return Ok(out),
                '\\' => {
                    let e = self.peek().ok_or_else(|| "edn: unterminated string".to_string())?;
                    self.pos += 1;
                    match e {
                        'n' => out.push('\n'),
                        't' => out.push('\t'),
                        'r' => out.push('\r'),
                        'b' => out.push('\u{8}'),
                        'f' => out.push('\u{c}'),
                        '"' => out.push('"'),
                        '\\' => out.push('\\'),
                        'u' => {
                            let hex: String = self.chars.get(self.pos..self.pos + 4).ok_or("edn: bad \\u escape")?.iter().collect();
                            let unit = u32::from_str_radix(&hex, 16).map_err(|_| "edn: bad \\u escape".to_string())?;
                            self.pos += 4;
                            out.push(self.unicode(unit)?);
                        }
                        other => return Err(format!("edn: unknown escape \\{other}")),
                    }
                }
                c => out.push(c),
            }
        }
    }

    /// Resolves a UTF-16 unit, pairing a high surrogate with a following `\uXXXX` low surrogate.
    fn unicode(&mut self, unit: u32) -> Result<char, String> {
        if (0xD800..0xDC00).contains(&unit) {
            if self.chars.get(self.pos) == Some(&'\\') && self.chars.get(self.pos + 1) == Some(&'u') {
                let hex: String = self.chars.get(self.pos + 2..self.pos + 6).ok_or("edn: bad \\u escape")?.iter().collect();
                let low = u32::from_str_radix(&hex, 16).map_err(|_| "edn: bad \\u escape".to_string())?;
                if (0xDC00..0xE000).contains(&low) {
                    self.pos += 6;
                    return char::from_u32(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00)).ok_or_else(|| "edn: bad surrogate pair".to_string());
                }
            }
            return Err("edn: lone surrogate in string".to_string());
        }
        char::from_u32(unit).ok_or_else(|| "edn: lone surrogate in string".to_string())
    }

    fn character(&mut self) -> Result<char, String> {
        self.pos += 1;
        let start = self.pos;
        // one char always, then any following non-delimiters (named chars like \newline)
        self.pos += 1;
        while let Some(c) = self.peek() {
            if is_delim(c) {
                break;
            }
            self.pos += 1;
        }
        let name: String = self.chars.get(start..self.pos).ok_or("edn: bad character")?.iter().collect();
        let mut it = name.chars();
        match (it.next(), it.next()) {
            (Some(c), None) => Ok(c),
            _ => match name.as_str() {
                "newline" => Ok('\n'),
                "space" => Ok(' '),
                "tab" => Ok('\t'),
                "return" => Ok('\r'),
                "backspace" => Ok('\u{8}'),
                "formfeed" => Ok('\u{c}'),
                n if n.starts_with('u') && n.len() == 5 => u32::from_str_radix(&n[1..], 16).ok().and_then(char::from_u32).ok_or_else(|| format!("edn: bad character \\{n}")),
                n => Err(format!("edn: unknown character \\{n}")),
            },
        }
    }

    fn atom(&mut self) -> Result<Edn, String> {
        let tok = self.token();
        if tok.is_empty() {
            return Err(format!("edn: unexpected input at {}", self.pos));
        }
        match tok.as_str() {
            "nil" => return Ok(Edn::Nil),
            "true" => return Ok(Edn::Bool(true)),
            "false" => return Ok(Edn::Bool(false)),
            _ => {}
        }
        if let Some(name) = tok.strip_prefix(':') {
            return Ok(Edn::Keyword(name.to_string()));
        }
        let first = tok.chars().next().unwrap();
        let numeric = first.is_ascii_digit() || (matches!(first, '+' | '-') && tok.chars().nth(1).is_some_and(|c| c.is_ascii_digit()));
        if numeric {
            let digits = tok.strip_prefix('+').unwrap_or(&tok);
            if let Ok(i) = digits.parse::<i64>() {
                return Ok(Edn::Int(i));
            }
            if tok.ends_with('N') || tok.ends_with('M') {
                return Err(format!("edn: arbitrary-precision number {tok} is not supported"));
            }
            return digits.parse::<f64>().map(Edn::Float).map_err(|_| format!("edn: invalid number {tok}"));
        }
        Ok(Edn::Symbol(tok))
    }
}

pub fn to_string(v: &Edn) -> String {
    let mut out = String::new();
    write_edn(&mut out, v);
    out
}

fn write_all(out: &mut String, items: &[Edn]) {
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        write_edn(out, item);
    }
}

fn write_edn(out: &mut String, v: &Edn) {
    match v {
        Edn::Nil => out.push_str("nil"),
        Edn::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Edn::Int(i) => {
            let _ = write!(out, "{i}");
        }
        Edn::Float(f) => {
            if f.is_nan() {
                out.push_str("##NaN");
            } else if f.is_infinite() {
                out.push_str(if *f > 0.0 { "##Inf" } else { "##-Inf" });
            } else {
                let _ = write!(out, "{f:?}");
            }
        }
        Edn::Str(s) => write_string(out, s),
        Edn::Char(c) => match c {
            '\n' => out.push_str("\\newline"),
            ' ' => out.push_str("\\space"),
            '\t' => out.push_str("\\tab"),
            '\r' => out.push_str("\\return"),
            c => {
                out.push('\\');
                out.push(*c);
            }
        },
        Edn::Keyword(k) => {
            out.push(':');
            out.push_str(k);
        }
        Edn::Symbol(s) => out.push_str(s),
        Edn::List(items) => {
            out.push('(');
            write_all(out, items);
            out.push(')');
        }
        Edn::Vector(items) => {
            out.push('[');
            write_all(out, items);
            out.push(']');
        }
        Edn::Set(items) => {
            out.push_str("#{");
            write_all(out, items);
            out.push('}');
        }
        Edn::Map(entries) => {
            out.push('{');
            for (i, (k, val)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_edn(out, k);
                out.push(' ');
                write_edn(out, val);
            }
            out.push('}');
        }
        Edn::Tagged(tag, inner) => {
            out.push('#');
            out.push_str(tag);
            out.push(' ');
            write_edn(out, inner);
        }
    }
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c => out.push(c),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rt(s: &str) -> String {
        to_string(&parse(s).unwrap())
    }

    #[test]
    fn scalars() {
        assert_eq!(parse("nil"), Ok(Edn::Nil));
        assert_eq!(parse("true"), Ok(Edn::Bool(true)));
        assert_eq!(parse("-42"), Ok(Edn::Int(-42)));
        assert_eq!(parse("+7"), Ok(Edn::Int(7)));
        assert_eq!(parse("2.5"), Ok(Edn::Float(2.5)));
        assert_eq!(parse("1e+21"), Ok(Edn::Float(1e21)));
        assert_eq!(parse(":a/b"), Ok(Edn::kw("a/b")));
        assert_eq!(parse("foo.bar/baz"), Ok(Edn::Symbol("foo.bar/baz".into())));
        assert_eq!(parse("-"), Ok(Edn::Symbol("-".into())));
    }

    #[test]
    fn symbolic_numbers() {
        assert_eq!(parse("##Inf"), Ok(Edn::Float(f64::INFINITY)));
        assert_eq!(parse("##-Inf"), Ok(Edn::Float(f64::NEG_INFINITY)));
        assert!(matches!(parse("##NaN"), Ok(Edn::Float(f)) if f.is_nan()));
        assert_eq!(rt("##Inf"), "##Inf");
    }

    #[test]
    fn strings_and_escapes() {
        assert_eq!(parse(r#""a\nb\t\"q\" \\ \u00e9""#), Ok(Edn::Str("a\nb\t\"q\" \\ é".into())));
        assert_eq!(parse(r#""\ud83d\ude00""#), Ok(Edn::Str("😀".into())));
        assert_eq!(rt(r#""a\nb""#), r#""a\nb""#);
        assert!(parse(r#""\ud83d""#).is_err());
        assert!(parse("\"open").is_err());
    }

    #[test]
    fn characters() {
        assert_eq!(parse("\\a"), Ok(Edn::Char('a')));
        assert_eq!(parse("\\newline"), Ok(Edn::Char('\n')));
        assert_eq!(parse("\\u00e9"), Ok(Edn::Char('é')));
        assert_eq!(rt("[\\a \\space]"), "[\\a \\space]");
    }

    #[test]
    fn collections() {
        assert_eq!(rt("[1 2 3]"), "[1 2 3]");
        assert_eq!(rt("(1 2)"), "(1 2)");
        assert_eq!(rt("#{1 2}"), "#{1 2}");
        assert_eq!(rt("{:a 1 :b [2 3]}"), "{:a 1, :b [2 3]}");
        assert_eq!(rt("{}"), "{}");
        assert_eq!(rt("[]"), "[]");
    }

    #[test]
    fn whitespace_comments_and_discard() {
        assert_eq!(rt("; c\n[1,, 2 #_ 3 4] ; tail"), "[1 2 4]");
        assert_eq!(rt("{:a #_:skip 1}"), "{:a 1}");
    }

    #[test]
    fn tagged_literals() {
        assert_eq!(rt("#inst \"2020-01-01\""), "#inst \"2020-01-01\"");
    }

    #[test]
    fn accessors() {
        let v = parse("{:xs [1 2.5] :name \"n\"}").unwrap();
        assert_eq!(v.get("name").and_then(Edn::as_str), Some("n"));
        let xs: Vec<f64> = v.get("xs").and_then(Edn::items).unwrap().iter().filter_map(Edn::as_f64).collect();
        assert_eq!(xs, vec![1.0, 2.5]);
        assert_eq!(Edn::Float(3.0).as_i64(), Some(3));
        assert_eq!(Edn::Float(3.5).as_i64(), None);
    }

    #[test]
    fn floats_keep_a_fraction_when_printed() {
        assert_eq!(to_string(&Edn::Float(1.0)), "1.0");
        assert_eq!(to_string(&Edn::Float(0.1)), "0.1");
    }

    #[test]
    fn errors() {
        assert!(parse("").is_err());
        assert!(parse("[1 2").is_err());
        assert!(parse("{:a}").is_err());
        assert!(parse("1 2").is_err());
        assert!(parse("12N").is_err());
        assert!(parse(")").is_err());
    }

    #[test]
    fn nested_round_trip() {
        let src = "{:users [{:id 1, :tags #{:a :b}, :score 9.5} {:id 2, :tags #{}, :score nil}], :ok true}";
        assert_eq!(rt(src), src);
    }
}
