---
layout: doc.liquid
title: clone API
---
[//]: # (cURLs in this file are generated from the .http file using http-client.env.json)

# Clone API

Let's say we have an account and a named subdomain. Because we're using [named subdomains](named-subdomains), the Gateway has a clone of the information in the (sub)domain.

Normally in an app using **m-ld**, clients _clone_ the domain locally and manipulate its data directly. However there are a number of reasons a client may not want to do this, such as:
- The client only has occasional need for data;
- It doesn't have enough storage capacity to clone the whole domain;
- No clone engine exists for its platform.

The 'clone' (noun, not verb) API is provided for such a client to access the data remotely over HTTP.

Some data can be added to the domain with:

```bash
curl -X POST --location "https://≪gateway≫/api/v1/domain/≪account name≫/≪subdomain≫/state" \
    -H "Content-Type: application/json" \
    -d "{
          \"@id\": \"Client-0005\",
          \"company_name\": \"The Flintstones\"
        }" \
    --basic --user ≪account name≫:≪account key≫
```

Data in the domain can be queried with:

```bash
curl -X GET --location "https://≪gateway≫/api/v1/domain/≪account name≫/≪subdomain≫/state?q=%7B%22%40describe%22%3A%22%3Fid%22%2C%22%40where%22%3A%7B%22%40id%22%3A%22%3Fid%22%7D%7D" \
    -H "Accept: application/json" \
    --basic --user ≪account name≫:≪account key≫
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
