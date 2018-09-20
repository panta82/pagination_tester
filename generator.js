class User {
  constructor(props) {
    this.id = undefined;
    this.name = undefined;
    this.surname = undefined;
    this.gender = undefined;
    this.ssn = undefined;
    this.email = undefined;
    this.company = undefined;
    this.born_at = undefined;
    this.timestamp = undefined;

    Object.assign(this, props);
  }
}

class Generator {
  constructor(client, chance) {
    /** @type {Client} */
    this._client = client;

    /** @type {Chance} */
    this._chance = chance;
  }

  migrate() {
    return this._client.query(`
      CREATE TABLE IF NOT EXIST users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        surname VARCHAR(50),
        gender VARCHAR(50),
        ssn VARCHAR(30),
        email VARCHAR(240),
        company VARCHAR(200),
        born_at DATETIMETZ,
        timestamp DATETIMETZ NOT NULL DEFAULT(CURRENT TIMESTAMP),
      )`);
  }

  _generateUser() {
    const user = new User();
    user.name = this._chance.first();
    user.surname = this._chance.last();
    user.gender = this._chance.gender();
    user.ssn = this._chance.ssn();
    user.email = this._chance.email();
    user.company = this._chance.company();

    const year = this._chance.integer({ min: 1950, max: 2000 });
    user.born_at = this._chance.date({ year });

    return user;
  }

  cleanData() {
    return this._client.query(`TRUNCATE TABLE users CASCADE ALL`);
  }

  _insert(tableName, ob) {
    const cols = [];
    const values = [];
    for (const key in ob) {
      if (ob[key] !== undefined) {
        cols.push(key);
        values.push(ob[key]);
      }
    }
    const placeholders = values.map((_, index) => "$" + (index + 1));
    return this._client.query(
      `INSERT INTO ${tableName}(${cols.join(", ")}) VALUES (${placeholders.join(
        ", "
      )})`,
      values
    );
  }

  generateData(count) {
    if (!count) {
      return Promise.resolve();
    }

    const user = this._generateUser();
    return this._insert("users", user).then(() => {
      console.log(`Generated: ${user.name} ${user.surname} (SSN: ${user.ssn})`);
      return this.generateData(Math.max(count || 0 - 1, 0));
    });
  }
}

module.exports = {
  Generator
};
