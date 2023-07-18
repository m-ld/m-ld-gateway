# Clone API

Let's say we have an account `my-account` with a named subdomain `my-subdomain`. Because we're using [named subdomains](named-subdomains.md), the Gateway has a clone of the information in the (sub)domain.

Some data can be added to the domain with:

```http request
POST http://my-gateway/api/v1/domain/my-account/my-subdomain/state
Authorization: Basic my-account my-key
Content-Type: application/json

{
  "@id": "Client-0005",
  "company_name": "The Flintstones"
}
```

Data in the domain can be queried with:

```http request
GET http://my-gateway/api/v1/domain/my-account/my-subdomain/state?q=%7B%22%40describe%22%3A%22%3Fid%22%2C%22%40where%22%3A%7B%22%40id%22%3A%22%3Fid%22%7D%7D
Authorization: Basic my-account my-key
Accept: application/json
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
