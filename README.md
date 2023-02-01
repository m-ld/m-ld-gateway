# m-ld Gateway

## build
```shell
npm run build
```

## start
The server needs at least the following environment variables:

| variable                | example                                 | comments            |
|-------------------------|-----------------------------------------|---------------------|
| M_LD_GATEWAY_AUTH__KEY  | `rootacc.keyid:0gcsqgsib3dqebaquaa4gna` | Root API access key |
| M_LD_GATEWAY_GATEWAY    | `my-imac.local`                         | Deployed domain name |
| M_LD_GATEWAY_DATA_PATH  | `./local/edge/gw/data`                  | Path for data       |

The root API access key must be of the form `rootacc.keyid:secret`, where `rootacc` and `keyid` are at least 5 characters of lowercase text. The `rootacc` will be the root account name.

The deployed domain name can be anything if the gateway is local (will be used in future).

The data path can be omitted, in which case a local path will be used in an OS-specific application data area.

For convenience these variables can be specified in a `.env` file in the working directory.

```shell
npm run start -- --genesis true
```

The `genesis` flag indicates that this is the first gateway of a potential cluster and must be included for the first startup.

## API getting started guide

A new domain can be created with:
```
PUT http://localhost:8080/api/v1/domain/rootacc/t1
Authorization: Basic rootacc rootacc.keyid:0gcsqgsib3dqebaquaa4gna
```
This creates the domain `t1` in the root account. Domain names must be composed only of lowercase letters, numbers, hyphens `-` and underscores `_`.

Some data can be added to the domain with:
```
POST http://localhost:8080/api/v1/domain/rootacc/t1/state
Authorization: Basic rootacc rootacc.keyid:0gcsqgsib3dqebaquaa4gna
Content-Type: application/json

{
  "@id": "Client-0005",
  "company_name": "The Flintstones"
}
```

All data in the domain can be queried with:
```
GET http://localhost:8080/api/v1/domain/rootacc/t1/state?q=%7B%22%40describe%22%3A%22%3Fid%22%2C%22%40where%22%3A%7B%22%40id%22%3A%22%3Fid%22%7D%7D
Authorization: Basic rootacc rootacc.keyid:0gcsqgsib3dqebaquaa4gna
Content-Type: application/json
```

Note that the query string includes the URL-encoded json-rql query, for example the describe-all query:
```json
{
  "@describe": "?id",
  "@where": {
    "@id": "?id"
  }
}
```