class Criteria {
  constructor(/** Criteria */ props) {
    this.filter = 'abc';
    this.min_age = 50;
    this.page = 1;
    this.page_size = 20;
    this.sort_field = 'ssn';
    this.sort_direction = 'asc';

    Object.assign(this, props);
  }
}

class QueryResult {
  constructor(rows, criteria, total) {
    this.data = rows;
    this.page = criteria.page;
    this.page_size = criteria.page_size;
    this.total = total;
    this.total_pages = Math.ceil(total / this.page_size);
  }
}

class UserStore {
  constructor(client, log) {
    /** @type {Client} */
    this._client = client;

    this._log = log || (() => {});
  }

  /**
   * @return {Promise<QueryResult>}
   */
  listV1(criteria) {
    this._log(`V1: ${JSON.stringify(criteria)}`);

    criteria = new Criteria(criteria);

    const filter = '%' + criteria.filter + '%';
    const youngestDate = criteria.min_age
      ? new Date(new Date() - criteria.min_age * 365 * 24 * 60 * 60 * 1000)
      : null;
    const offset = (criteria.page - 1) * criteria.page_size;

    let baseSQL = `
      SELECT *
      FROM users
      WHERE (name LIKE $1
          OR surname LIKE $1
          OR company LIKE $1
          OR email LIKE $1)
      AND born_at <= $2
    `;

    const countSQL = baseSQL.replace('SELECT *', 'SELECT COUNT(*)');
    const rowsSQL =
      baseSQL + ` ORDER BY ${criteria.sort_field} ${criteria.sort_direction} OFFSET $3 LIMIT $4`;

    return Promise.all([
      this._client.query(rowsSQL, [filter, youngestDate, offset, criteria.page_size]),
      this._client.query(countSQL, [filter, youngestDate]),
    ]).then(([rowsRes, countRes]) => {
      return new QueryResult(rowsRes.rows, criteria, Number(countRes.rows[0].count));
    });
  }

  /**
   * @return {Promise<QueryResult>}
   */
  listV2(criteria) {
    this._log(`V2: ${JSON.stringify(criteria)}`);

    const filter = '%' + criteria.filter + '%';
    const youngestDate = criteria.min_age
      ? new Date(new Date() - criteria.min_age * 365 * 24 * 60 * 60 * 1000)
      : null;
    const offset = (criteria.page - 1) * criteria.page_size;

    const sql = `
      SELECT *, count(*) OVER() AS __full_count__
      FROM users
      WHERE (name LIKE $1
          OR surname LIKE $1
          OR company LIKE $1
          OR email LIKE $1)
      AND born_at <= $2
      ORDER BY ${criteria.sort_field} ${criteria.sort_direction}
      OFFSET $3
      LIMIT $4
    `;

    return this.withoutIndexScans(() => {
      return this._client
        .query(sql, [filter, youngestDate, offset, criteria.page_size])
        .then(rowsRes => {
          let count = undefined;
          rowsRes.rows.forEach(row => {
            if (count === undefined) {
              count = Number(row.__full_count__);
            }
            delete row.__full_count__;
          });

          return new QueryResult(rowsRes.rows, criteria, count);
        });
    });
  }

  withoutIndexScans(executor) {
    return this._client
      .query(`SET SESSION enable_indexscan = OFF;`)
      .then(() => executor.call(this))
      .finally(() => {
        return this._client.query(`SET SESSION enable_indexscan = ON;`);
      });
  }
}

// *****************************

module.exports = {
  Criteria,
  QueryResult,
  UserStore,
};
