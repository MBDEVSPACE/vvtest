import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: '+00:00'        // All DATETIME columns are stored as UTC
})

export async function query(sql, params = {}) {
  const [rows] = await pool.query(sql, params)
  return rows
}
