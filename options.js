const ENVS = {
  PGHOST: 'pg_host',
  PGPORT: 'pg_port',
  PGUSER: 'pg_user',
  PGPASSWORD: 'pg_password',
  PGDATABASE: 'pg_database',
};

class Options {
  constructor() {
    this.pg_host = 'localhost';
    this.pg_port = '5432';
    this.pg_user = undefined;
    this.pg_password = undefined;
    this.pg_database = 'counttest';
  }

  loadFromEnv(env = process.env) {
    for (const key in ENVS) {
      if (env[key] !== undefined) {
        this[ENVS[key]] = env[key];
      }
    }
  }
}

module.exports = {
  Options,
};
