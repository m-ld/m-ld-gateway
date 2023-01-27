## requirements

### app simplicity
app does not need to buffer, order or store queue of updates

### write "synchronously" returns an update
so the app can immediately apply update to e.g. database

### compatible with two-phase commit
so app can apply atomic changes to e.g. database

## prior art

### [STOMP](https://stomp.github.io/)

> STOMP provides an interoperable wire format... to provide easy and widespread messaging interoperability among many languages, platforms and brokers.

> STOMP is a very simple and easy to implement protocol, coming from the HTTP school of design; the server side may be hard to implement well, but it is very easy to write a client

- Small set of commands (see [1.0 spec](https://stomp.github.io/stomp-specification-1.0.html))
- May not be actively maintained
  - [Comment in Apache Camel docs](https://camel.apache.org/components/3.20.x/stomp-component.html)
  - [Spec discussion group](https://groups.google.com/g/stomp-spec) has some recent messages
- [Javascript client library](https://github.com/stomp-js/stompjs) is mature and maintained
- [PHP client library](https://github.com/stomp-php/stomp-php) last commit 2021, [quite popular](https://packagist.org/packages/stomp-php/stomp-php)
- [Stomp.Net](https://github.com/DaveSenn/Stomp.Net) author is ["not happy with the code"](https://github.com/DaveSenn/Stomp.Net/issues/11) but has [44 downloads/day](https://www.nuget.org/packages/Stomp.Net/)

### HTTP Push (webhook)

Svix (webhook platform) [blog on ordering difficulties](https://www.svix.com/blog/guaranteeing-webhook-ordering/). Suggests including modification date or counter (= tick).
- That requires buffering in the app webhook

Hacker News [comment in response suggests](https://news.ycombinator.com/item?id=32333661) empty webhook payload (= `readable` event).

### HTTP Pull (polling)

Apache ActiveMQ [proposed a REST API](https://activemq.apache.org/restful-queue).
- Subscriptions are REST resources, which realise _leases_ on a Queue
- Messages are consumed by DELETE from the subscription

Amazon SQS
[Basic architecture](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-architecture.html)
- Polling via [Receive Message action](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html)
- Messages are consumed by [deletion from the queue](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/step-receive-delete-message.html)
- A message that isn't deleted or a message whose visibility isn't extended before the visibility timeout expires counts as a failed receive. Depending on the configuration of the queue, the message might be sent to the dead-letter queue.

Azure Queue Storage
- When [getting messages](https://learn.microsoft.com/en-us/rest/api/storageservices/get-messages#remarks), a message is usually reserved for deletion until the `visibilitytimeout` interval expires.
- When a message is retrieved for the first time, its DequeueCount property is set to 1. If it is not deleted and is subsequently retrieved again, the DequeueCount property is incremented.