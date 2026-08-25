# Ship A Slim Printer Status In v0.1

`getStatus` and a successful `sendData` return `connection`, `online`, `coverOpen`, `paper`, and `errorStatus`. Each field is `{ statusCode, status, message }`. Battery, drawer, buzzer, adapter, and other Epson sensor fields are a follow-up issue, not the first slice.
