"""Log layout shared with the other apps: ``asctime - logger - level - message``, the message a one-line JSON object
for the access log."""

LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
ACCESS_LOGGER = "champagnefestival.access"
