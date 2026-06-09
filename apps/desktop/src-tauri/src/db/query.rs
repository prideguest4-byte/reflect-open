//! The read-only query bridge: executes SQL the frontend compiled with Kysely.
//!
//! Parameters are bound (never interpolated) and any mutating statement is
//! rejected via `Statement::readonly`, so this surface can read the projection
//! but never write it — writes go through the transactional path in
//! [`super::write`].

use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};

fn json_to_sql(value: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as Sql;
    match value {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(i64::from(*b)),
        Value::Number(n) => n
            .as_i64()
            .map(Sql::Integer)
            .or_else(|| n.as_f64().map(Sql::Real))
            .unwrap_or(Sql::Null),
        Value::String(s) => Sql::Text(s.clone()),
        // arrays/objects arrive only from the `json()` helper → store as JSON text
        other => Sql::Text(other.to_string()),
    }
}

fn column_to_json(row: &rusqlite::Row, index: usize) -> AppResult<Value> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(index)? {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(n) => Value::from(n),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(bytes) => Value::from(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => Value::from(bytes.to_vec()),
    })
}

/// Execute a read query the frontend compiled with Kysely; rows as JSON objects.
pub(super) fn run_query(
    conn: &Connection,
    sql: &str,
    params: &[Value],
) -> AppResult<Vec<Map<String, Value>>> {
    let mut stmt = conn.prepare(sql)?;
    // `db_query` is a read-only bridge — writes go through the `index_*` commands.
    // Reject any mutating statement so a compromised/buggy caller can't write.
    if !stmt.readonly() {
        return Err(AppError::io("db_query only executes read-only statements"));
    }
    let columns: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
    let bound: Vec<rusqlite::types::Value> = params.iter().map(json_to_sql).collect();
    let mut rows = stmt.query(params_from_iter(bound))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut object = Map::with_capacity(columns.len());
        for (index, name) in columns.iter().enumerate() {
            object.insert(name.clone(), column_to_json(row, index)?);
        }
        out.push(object);
    }
    Ok(out)
}
