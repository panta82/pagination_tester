class Criteria {
  constructor(/** Criteria */ props) {
    this.filter = 'abc';
    this.min_age = 20;
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
  constructor(client) {
    /** @type {Client} */
    this._client = client;
  }

  /**
   * @return {Promise<QueryResult>}
   */
  listV1(criteria) {
    console.log(`V1: ${JSON.stringify(criteria)}`);

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
    const rowsSQL = baseSQL + ` ORDER BY $3 ${criteria.sort_direction} OFFSET $4 LIMIT $5`;

    return Promise.all([
      this._client.query(rowsSQL, [
        filter,
        youngestDate,
        criteria.sort_field,
        offset,
        criteria.page_size,
      ]),
      this._client.query(countSQL, [filter, youngestDate]),
    ]).then(([rowsRes, countRes]) => {
      return new QueryResult(rowsRes.rows, criteria, Number(countRes.rows[0].count));
    });
  }
}

// *****************************

module.exports = {
  Criteria,
  QueryResult,
  UserStore,
};
