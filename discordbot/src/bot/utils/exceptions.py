class InvalidHTTPErrorException(Exception):
    """Raised when an invalid HTTP error occurs."""
    status_code: int
    error_message: str

    def __init__(self, status_code: int, error_message: str):
        self.status_code = status_code
        self.error_message = error_message
        super().__init__(f"HTTP Error {status_code}: {error_message}")