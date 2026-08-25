# Use A Printer Class For The Public JavaScript Interface

Callers import a JavaScript `Printer` class (`new Printer({ target, deviceName })`) with instance methods for connect, Command Buffer, and send. The public interface is not NFC-style functions-plus-id and not an Expo SharedObject. Native ownership (including a SharedObject) may exist behind the class; app code does not import it.
