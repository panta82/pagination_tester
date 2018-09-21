# Paginator tester

How do you get both the rows and page count in a pagination scenario? This app tests different pagination strategies on a large-ish data set.

You need to create a postgres database first. You can supply db params as ENV-s.

```
npm install
PGPASSWORD=whatever ./bin/generate.js 1000000
PGPASSWORD=whatever ./bin/tester.js
```

### Testing

Testing involves performing 4 different `SELECT` queries, filtering and sorting on different indexed or non-indexed columns. Each query is executed in 4 variants, trying out different pagination strategies.

#### Variant 1

Separate `SELECT *` and `SELECT COUNT(*)` queries run in parallel. The most basic and often used solution.

```sql
SELECT *
FROM data
WHERE condition
ORDER BY field ASC
OFFSET 40
LIMIT 20;

SELECT COUNT(*)
FROM data
WHERE condition;
```

Programming challenge is moderate. Need to split queries into 2 versions (one with only `WHERE`-s, other with `OFFSET`, `LIMIT` and `ORDER`).

#### Variant 2

Add a new column using a window function, so each row of the result set contains the full count. Inspired by https://stackoverflow.com/a/28888696/2405595

```sql
SELECT *, count(*) OVER() AS __full_count__
FROM data
WHERE condition
ORDER BY field ASC
OFFSET 40
LIMIT 20;
```

Programming challenge is easy. You just need to add an extra item in the SELECT statement, and later delete the extra column from the result rows. If you need page count in case of empty result set, it can become dicy, though.

Window function has an impact on query optimizer, making performance very variable (see below).

#### Variant 3

Same as variant 2, with a wrapper that sets `enable_indexscan` to `OFF`. This is an attempt to improve the impact of the window function, which seems to produce bad plans in some cases (index scan where full scan would be faster).

```sql
SET SESSION enable_indexscan = OFF;
SELECT *, count(*) OVER() AS __full_count__
FROM data
WHERE condition
ORDER BY field ASC
OFFSET 40
LIMIT 20;
SET SESSION enable_indexscan = ON;
```

Results of this optimization are mixed.

#### Variant 4

Add count as an extra row at the end of the result set. To do this, we need to perform two different CTE-s, and also to cast all results to JSON, so that we can combine 2 result sets in a generic maner.

```sql
WITH __data__ AS (
    SELECT *
    FROM data
    WHERE condition
)
, __rows__ AS (
    SELECT *
    FROM __data__
    ORDER BY field ASC
    OFFSET 40
    LIMIT 20
)
SELECT row_to_json(__rows__)
FROM __rows__
UNION ALL
SELECT to_json(COUNT(*))
FROM __data__
```

Programming challenge is impossible if returning native result sets and fairly easy with JSON-s (presuming a nodejs backend).

### Results

Results on 2 million rows, on a strong linux box.

```

Testing the most basic query, without filters, sort on PK...
    [Page          1]     V1: 0.13 sec     V2: 0.57 sec     V3: 0.97 sec     V4: 0.57 sec
    [Page      21182]     V1: 0.16 sec     V2: 0.61 sec     V3: 1.81 sec     V4: 1.36 sec
    [Page      42363]     V1: 0.20 sec     V2: 0.65 sec     V3: 1.87 sec     V4: 1.42 sec
    [Page      63544]     V1: 0.24 sec     V2: 0.71 sec     V3: 1.88 sec     V4: 1.43 sec
    [Page      84725]     V1: 0.29 sec     V2: 0.79 sec     V3: 1.92 sec     V4: 1.47 sec
    [Page     105906]     V1: 0.33 sec     V2: 0.81 sec     V3: 1.96 sec     V4: 1.50 sec

Testing a simple filter, sort on a non-indexed column
    [Page          1]     V1: 1.30 sec     V2: 0.65 sec     V3: 0.66 sec     V4: 0.65 sec
    [Page        162]     V1: 1.31 sec     V2: 0.67 sec     V3: 0.66 sec     V4: 0.65 sec
    [Page        323]     V1: 1.29 sec     V2: 0.65 sec     V3: 0.65 sec     V4: 0.65 sec
    [Page        484]     V1: 1.28 sec     V2: 0.66 sec     V3: 0.66 sec     V4: 0.65 sec
    [Page        645]     V1: 1.29 sec     V2: 0.66 sec     V3: 0.66 sec     V4: 0.65 sec
    [Page        806]     V1: 1.29 sec     V2: 0.67 sec     V3: 0.66 sec     V4: 0.65 sec

Testing a simple where condition, sort on a non-unique index
    [Page          1]     V1: 0.23 sec     V2: 3.51 sec     V3: 0.90 sec     V4: 0.64 sec
    [Page      14008]     V1: 0.90 sec     V2: 3.55 sec     V3: 1.99 sec     V4: 1.74 sec
    [Page      28015]     V1: 1.52 sec     V2: 3.60 sec     V3: 2.05 sec     V4: 1.79 sec
    [Page      42022]     V1: 2.19 sec     V2: 3.63 sec     V3: 2.06 sec     V4: 1.83 sec
    [Page      56029]     V1: 2.83 sec     V2: 3.68 sec     V3: 2.14 sec     V4: 1.89 sec
    [Page      70036]     V1: 3.48 sec     V2: 3.67 sec     V3: 2.18 sec     V4: 1.91 sec

Testing a complex query, sort on a unique index...
    [Page          1]     V1: 0.54 sec     V2: 3.48 sec     V3: 0.41 sec     V4: 0.40 sec
    [Page          4]     V1: 1.13 sec     V2: 3.48 sec     V3: 0.40 sec     V4: 0.40 sec
    [Page          7]     V1: 0.80 sec     V2: 0.40 sec     V3: 0.41 sec     V4: 0.40 sec
    [Page         10]     V1: 0.80 sec     V2: 0.40 sec     V3: 0.40 sec     V4: 0.40 sec
    [Page         13]     V1: 0.79 sec     V2: 0.40 sec     V3: 0.41 sec     V4: 0.40 sec
    [Page         16]     V1: 0.80 sec     V2: 0.40 sec     V3: 0.41 sec     V4: 0.41 sec
```

### Thoughts

**Variant 1** is generally the most stable and predictable of the bunch. It has good performance on low page counts and if indexes are present. It quickly deteriorates as page goes higher and if there are no indexes. 

**Variants 2 and 3** are performing better than 1 on no indexes. With indexes, performance is very volatile. PG engine (9.6) can't seem to figure out how to optimize these plans properly.

**Variant 4** has a constant penalty of JSON serialization and subqueries, but this is mostly visible on low page counts. On higher pages, it is both fast (fastest?) and consistent in its performance. It has the most complex query of the bunch and an esoteric result type which might not be suitable for all queries.

For a generic application, I think I would still go with **Variant 1**. It is well understood, and has solid consistent performance in the low page ranges, which is what most queries will be anyway.

The only place where 2 queries instead of one is clearly felt is in Test 2, with non-indexed fields, where it is twice slower than any of the single query methods. But if this becomes a problem, it is a well understood problem that is easy to resolve (add indexes).

My second choice would be **Variant 4**. It offers advantages of a single query in scenarios without indexes, but without volatility of **V2** and **V3**. On the downside, it adds 2 CTE-s and casts all rows to JSON. This creates a large surface area for potential problems and edge cases. Can everything be cast to JSON? What if caller wants to have their own CTE-s? Will all tooling know how to handle JSON results? Etc. Better keep it simple, until the performance really starts hurting.