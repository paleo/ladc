import { Pool } from "./Pool"
import { BasicDatabaseConnection } from "./driver-definitions"
import { DatabaseConnection, MycnOptions, SqlParameters } from "./exported-definitions"
import { toExecResult, toPreparedStatement, toSingleRow, toSingleValue } from "./helpers"
import { makeTransactionConnection } from "./makeTransactionConnection"

export async function makeDbConnection(options: MycnOptions, pool: Pool<BasicDatabaseConnection>): Promise<DatabaseConnection> {
  let closed = false
  let prepareCb = cnBasicCallback("prepare")
  let obj: DatabaseConnection = {
    async prepare(sql: string, params?: SqlParameters) {
      return await toPreparedStatement(options, await prepareCb(sql, params))
    },
    async exec(sql: string, params?: SqlParameters) {
      if (closed)
        throw new Error(`Invalid call to 'exec', the connection is closed`)
      let cn = await pool.grab()
      let res = await cn.exec(sql, params)
      pool.release(cn)
      return toExecResult(options, res)
    },
    all: cnBasicCallback("all"),
    async singleRow(sql: string, params?: SqlParameters) {
      return toSingleRow(await this.all(sql, params))
    },
    async singleValue(sql: string, params?: SqlParameters) {
      return toSingleValue(await this.singleRow(sql, params))
    },
    execScript: cnBasicCallback("execScript"),

    beginTransaction: async (force = false) => {
      if (closed)
        throw new Error(`Invalid call to 'beginTransaction', the connection is closed`)
      return await makeTransactionConnection(options, pool)
    },
    close: async () => {
      if (closed)
        throw new Error(`Invalid call to 'close', the connection is already closed`)
      closed = true
      await pool.close()
    }
  }
  if (options.modifyConnection)
    obj = await options.modifyConnection(obj)
  return obj

  function cnBasicCallback(method: string) {
    return async (...args) => {
      if (closed)
        throw new Error(`Invalid call to '${method}', the connection is closed`)
      let cn = await pool.grab()
      let res = await cn[method](...args)
      pool.release(cn)
      return res
    }
  }
}
