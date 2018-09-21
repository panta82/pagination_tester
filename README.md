# Paginator tester

Test different pagination strategies on a large-ish data set

```
npm install
PGPASSWORD=whatever ./bin/generate.js 100000
PGPASSWORD=whatever ./bin/tester.js
```

#### Variant 1

Separate `SELECT *` and `SELECT COUNT(*)` queries run in parallel. The most basic and often used solution.

Programming challenge is moderate. Need to split queries into 2 versions (one with only `WHERE`-s, other with `OFFSET`, `LIMIT` and `ORDER`). 

#### Variant 2

Add a new column using a window function, so each row of the result set contains the full count. Inspired by https://stackoverflow.com/a/28888696/2405595

Programming challenge is easy. Very simple to attach new row and clean up the result afterwards. Could be a challenge if you get an empty result set, and need the full count.

Performance is very variable, see variant 3

#### Variant 3

Same as variant 2, with a wrapper that sets `enable_indexscan` to `OFF`. This is an attempt to improve impact of the window function, which seems to produce bad plans in some cases (index scan where full scan would be faster).

Results are mixed.

