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
  _doVariant2(criteria) {
    const lines = ['SELECT *, count(*) OVER() AS __full_count__', 'FROM users'];
    const values = [];

    criteria.where(lines, values);
    criteria.sort(lines, values);
    criteria.paginate(lines, values);

    return this._client.query(lines.join('\n'), values).then(res => {
      let count = undefined;
      res.rows.forEach(row => {
        if (count === undefined) {
          count = Number(row.__full_count__);
        }
        delete row.__full_count__;
      });

      return new QueryResult(res.rows, criteria, count);
    });
  }

  /**
   * @return {Promise<QueryResult>}
   */
  variant2(criteria) {
    this._log(`V2: ${JSON.stringify(criteria)}`);

    return this._doVariant2(criteria);
  }

  /**
   * @return {Promise<QueryResult>}
   */
  variant3(criteria) {
    this._log(`V3: ${JSON.stringify(criteria)}`);

    return this._withoutIndexScans(() => {
      return this._doVariant2(criteria);
    });
  }

  /**
   * @return {Promise<QueryResult>}
   */
  variant4(criteria) {
    let lines = ['SELECT *', 'FROM users'];
    const values = [];
    criteria.where(lines, values);

    lines = ['WITH __data__ AS (', ...lines, ')', ', __rows__ AS (', 'SELECT *', 'FROM __data__'];

    criteria.sort(lines, values);
    criteria.paginate(lines, values);

    lines.push(
      ...[
        ')',
        'SELECT row_to_json(__rows__) AS __json__',
        'FROM __rows__',
        'UNION ALL',
        'SELECT to_json(COUNT(*)) AS __json__',
        'FROM __data__',
      ]
    );

    return this._client.query(lines.join('\n'), values).then(res => {
      const rows = res.rows.slice(0, -1).map(row => row.__json__);
      const count = Number(res.rows[res.rows.length - 1].__json__);
      return new QueryResult(rows, criteria, count);
    });
  }

  _withoutIndexScans(executor) {
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
