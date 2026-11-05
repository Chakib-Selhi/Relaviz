/**
 * Types minimaux de sql.js, limités à ce que le moteur utilise (voir sql-oracle.js).
 * Le paquet ne fournit pas ses propres déclarations.
 */
declare module 'sql.js' {
  type Value = string | number | null;

  interface Database {
    exec(sql: string): Array<{ columns: string[]; values: Value[][] }>;
    run(sql: string, params?: Value[]): Database;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new () => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
