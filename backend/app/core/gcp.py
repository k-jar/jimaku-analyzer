import os
import base64
import json
from typing import Optional
from google.oauth2 import service_account
from google.oauth2.service_account import Credentials


def get_vision_credentials() -> Optional[Credentials]:
    """Retrieves Google Cloud Vision credentials from environment variables.

    Expects 'GOOGLE_CREDENTIALS_BASE64' to contain a base64 encoded JSON key.

    Returns:
        Optional[Credentials]: The service account credentials object, or None if not found.
    """
    # Try to get the Base64 string from Environment
    b64_creds = os.environ.get("GOOGLE_CREDENTIALS_BASE64")

    if b64_creds:
        creds_json = base64.b64decode(b64_creds)
        creds_dict = json.loads(creds_json)
        return service_account.Credentials.from_service_account_info(creds_dict)

    return None
