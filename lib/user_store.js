function placeholder(values) {
  return '$' + (values.length + 1);
}

class Criteria {
  constructor(/** Criteria */ props) {
    this.filter = null;
    this.min_age = null;
    this.sort_field = null;
    this.page = 1;
    this.page_size = 20;
    this.sort_direction = 'asc';

    Object.assign(this, props);
  }

  where(lines, values) {
    lines.push('WHERE 1=1');

    if (this.filter) {
      lines.push(`
        AND (name LIKE ${placeholder(values)}
          OR surname LIKE ${placeholder(values)}
          OR company LIKE ${placeholder(values)}
          OR email LIKE ${placeholder(values)})        
      `);
      values.push('%' + this.filter + '%');
    }

    if (this.min_age) {
      const youngestDate = new Date(new Date() - this.min_age * 365 * 24 * 60 * 60 * 1000);
      lines.push(`AND born_at <= ${placeholder(values)}`);
      values.push(youngestDate);
    }
  }

  sort(lines, values) {
    if (this.sort_field) {
      lines.push(`ORDER BY ${this.sort_field} ${this.sort_direction}`);
    }
  }

  paginate(lines, values) {
    lines.push(`OFFSET ${placeholder(values)}`);
    const offset = (this.page - 1) * this.page_size;
    values.push(offset);

    lines.push(`LIMIT ${placeholder(values)}`);
    values.push(this.page_size);
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
  variant1(criteria) {
    this._log(`V1: ${JSON.stringify(criteria)}`);

    criteria = new Criteria(criteria);

    const lines = ['FROM users'];
    const values = [];

    criteria.where(lines, values);

    const countSQL = ['SELECT COUNT(*)'].concat(lines).join('\n');
    const countPromise = this._client.query(countSQL, values.slice());

    criteria.sort(lines, values);
    criteria.paginate(lines, values);
    const rowsSQL = ['SELECT *'].concat(lines).join('\n');
    const rowsPromise = this._client.query(rowsSQL, values);

    return Promise.all([rowsPromise, countPromise]).then(([rowsRes, countRes]) => {
      return new QueryResult(rowsRes.rows, criteria, Number(countRes.rows[0].count));
    });
  }

  /**
   * @return {Promise<QueryResult>}
   */
  variant2(criteria) {
    this._log(`V2: ${JSON.stringify(criteria)}`);

    const lines = ['SELECT *, count(*) OVER() AS __full_count__', 'FROM users'];
    const values = [];

    criteria.where(lines, values);
    criteria.sort(lines, values);
    criteria.paginate(lines, values);

    return this._client.query(lines.join('\n'), values).then(rowsRes => {
      let count = undefined;
      rowsRes.rows.forEach(row => {
        if (count === undefined) {
          count = Number(row.__full_count__);
        }
        delete row.__full_count__;
      });

      return new QueryResult(rowsRes.rows, criteria, count);
    });
  }

  /**
   * @return {Promise<QueryResult>}
   */
  variant3(criteria) {
    return this.withoutIndexScans(() => {
      return this.variant2(criteria);
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
