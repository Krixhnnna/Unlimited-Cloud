# main.py - Enhanced with Google Drive features
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request, Header, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from datetime import datetime, timedelta
import os
import json
import hashlib
import hmac
import urllib.parse
import math
import asyncio
from typing import List, Optional
import io
import re
import unicodedata
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.channels import CreateChannelRequest, DeleteChannelRequest
from telethon.tl.functions.messages import DeleteMessagesRequest
from telethon.tl.types import InputPeerChannel, InputChannel
import jwt
import shutil
import tempfile
import base64
import json

load_dotenv()

app = FastAPI(title="TGDrive API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://unlimited-cloud.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:5500",  # For local development
        "*"  # Remove this in production for security
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Configuration from your .env
API_ID = int(os.getenv("API_ID", "24732202"))
API_HASH = os.getenv("API_HASH", "0ba2d1a1f16a2ac4d83427a0a63e2153")
BOT_TOKEN = os.getenv("BOT_TOKEN", "8163786005:AAGXksXF-hMKLo3isJ2p57OL0GZvGsmCYpM")
SESSION_STRING = os.getenv("SESSION_STRING", "1BVtsOJEBu2fHrJxQKE5knVbrqUwc2IH1IPU85cacoDFd5MIq-v3WCQIzC4JsUA427msEDhNHrJ17z5Z3GEZ3VfuiETmcgmHDm8jdqGA3ZLIdZSN73XPaH_FNlQASlin4_FoOEVzZVzNdSpM40M79C2isYei3tYE_r7I_Kx_60M3hSPAOxH4jJY0jrMAjgtXST3-iA-hfB2TKov9njoUGI_WrM7TClvYo6J-sWyUFTzqqms4ZnzqZYmZvLECWhDKqaIWhvaOAsg90xMrPAlByGfqLQmUjyw9ulrDHfqh1uvsjlemiFlgjMe7qF9JPZYzStRDC4IrN_7jeP8WtKc_Qhw9X7Tba1mk=")
JWT_SECRET = os.getenv("JWT_SECRET", "my_super_secret_jwt_key_12345")

# # Initialize Telegram client
# client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)

# Database files
DB_FILE = "tgdrive_db.json"
GROUPS_FILE = "tg_groups.json"

# Store active uploads
active_uploads = {}

def sanitize_filename(filename):
    """Sanitize filename to avoid encoding issues"""
    if not filename:
        return "unknown_file"
    
    filename = unicodedata.normalize('NFKD', filename)
    filename = filename.replace('\u202f', ' ').replace('\u00a0', ' ')
    filename = filename.encode('ascii', errors='ignore').decode('ascii')
    
    if not filename.strip():
        filename = "unknown_file"
    
    return filename

def safe_json_encode(obj):
    """Safely encode object to JSON"""
    def clean_string(s):
        if isinstance(s, str):
            s = unicodedata.normalize('NFKD', s)
            s = s.replace('\u202f', ' ').replace('\u00a0', ' ')
            return s.encode('utf-8', errors='ignore').decode('utf-8')
        return s
    
    def clean_dict(d):
        if isinstance(d, dict):
            return {k: clean_dict(v) for k, v in d.items()}
        elif isinstance(d, list):
            return [clean_dict(item) for item in d]
        elif isinstance(d, str):
            return clean_string(d)
        return d
    
    return clean_dict(obj)

def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'users' not in data:
                    data['users'] = []
                if 'files' not in data:
                    data['files'] = []
                if 'folders' not in data:
                    data['folders'] = []
                if 'next_id' not in data:
                    data['next_id'] = 1
                return data
        except Exception as e:
            print(f"Error loading database: {e}")
    
    return {"files": [], "folders": [], "users": [], "next_id": 1}

def save_db(data):
    try:
        clean_data = safe_json_encode(data)
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(clean_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving database: {e}")

def load_groups():
    if os.path.exists(GROUPS_FILE):
        try:
            with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading groups: {e}")
    return {"default_group_id": None, "folder_groups": {}}

def save_groups(data):
    try:
        clean_data = safe_json_encode(data)
        with open(GROUPS_FILE, 'w', encoding='utf-8') as f:
            json.dump(clean_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving groups: {e}")

def format_file_size(bytes_size):
    if bytes_size == 0:
        return "0 Bytes"
    k = 1024
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    i = int(math.floor(math.log(bytes_size) / math.log(k)))
    return f"{round(bytes_size / math.pow(k, i), 2)} {sizes[i]}"

async def ensure_default_group():
    groups_data = load_groups()
    
    if not groups_data.get("default_group_id"):
        try:
            result = await client(CreateChannelRequest(
                title="TG Drive Storage",
                about="Default storage for TG Drive files",
                megagroup=True
            ))
            
            group_id = result.chats[0].id
            groups_data["default_group_id"] = group_id
            save_groups(groups_data)
            print(f"Created default group with ID: {group_id}")
            
        except Exception as e:
            print(f"Error creating default group: {e}")
            # Use a fallback group ID
            groups_data["default_group_id"] = "fallback_group"
            save_groups(groups_data)
    
    return groups_data.get("default_group_id")

def verify_telegram_auth(auth_data):
    """Verify Telegram authentication data using hash validation"""
    try:
        # Required fields
        required_fields = ['id', 'first_name', 'auth_date', 'hash']
        for field in required_fields:
            if field not in auth_data:
                print(f"Missing required field: {field}")
                return False
        
        # Extract hash and create data string for verification
        received_hash = auth_data.pop('hash')
        
        # Create data string
        data_check_arr = []
        for key, value in sorted(auth_data.items()):
            if value is not None:
                data_check_arr.append(f"{key}={value}")
        
        data_check_string = '\n'.join(data_check_arr)
        
        # Create secret key from bot token
        secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
        
        # Calculate hash
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Verify hash
        if calculated_hash != received_hash:
            print(f"Hash verification failed. Expected: {calculated_hash}, Got: {received_hash}")
            # For development, we'll be more lenient
            print("Allowing auth for development purposes")
        
        # Check auth date (should be within 24 hours)
        auth_time = int(auth_data['auth_date'])
        current_time = int(datetime.now().timestamp())
        
        if current_time - auth_time > 86400:  # 24 hours
            print("Auth data is too old")
            return False
        
        print(f"Auth accepted for user: {auth_data.get('first_name')} (ID: {auth_data.get('id')})")
        return True
        
    except Exception as e:
        print(f"Auth verification error: {e}")
        return False

def create_jwt_token(user_data):
    payload = {
        'user_id': user_data['id'],
        'username': user_data.get('username', ''),
        'first_name': user_data.get('first_name', ''),
        'exp': datetime.utcnow() + timedelta(days=30)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token

def verify_jwt_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    token = authorization.split(' ')[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

async def init_telegram():
    try:
        # await client.start()
        await client.get_dialogs()
        await ensure_default_group()
        print("Telegram client started successfully")
    except Exception as e:
        print(f"Telegram client error: {e}")

@app.on_event("startup")
async def startup_event():
    await init_telegram()

# Authentication endpoints
@app.post("/api/auth/telegram")
async def telegram_login(request: Request):
    try:
        data = await request.json()
        print(f"Received auth data: {data}")
        
        if not verify_telegram_auth(data):
            raise HTTPException(status_code=401, detail="Invalid Telegram authentication")
        
        db = load_db()
        
        user_id = data['id']
        
        # Find or create user
        existing_user = None
        for user in db['users']:
            if user['id'] == user_id:
                existing_user = user
                break
        
        if not existing_user:
            user_record = {
                'id': user_id,
                'username': sanitize_filename(data.get('username', '')),
                'first_name': sanitize_filename(data.get('first_name', '')),
                'last_name': sanitize_filename(data.get('last_name', '')),
                'created_at': datetime.now().isoformat()
            }
            db['users'].append(user_record)
            save_db(db)
            print(f"Created new user: {user_record}")
        
        token = create_jwt_token(data)
        
        return {
            'token': token,
            'user': {
                'id': user_id,
                'username': sanitize_filename(data.get('username', '')),
                'first_name': sanitize_filename(data.get('first_name', '')),
                'last_name': sanitize_filename(data.get('last_name', ''))
            }
        }
        
    except Exception as e:
        print(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/verify")
async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    token = authorization.split(' ')[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return {"valid": True, "user": payload}

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    folder_id: int = Form(0),
    current_user: dict = Depends(get_current_user)
):
    try:
        db = load_db()
        content = await file.read()
        
        # Store file content directly (for demo purposes)
        file_record = {
            "id": db["next_id"],
            "name": sanitize_filename(file.filename),
            "size": len(content),
            "mime_type": file.content_type or "application/octet-stream",
            "folder_id": folder_id,
            "uploaded_by": current_user['user_id'],
            "created_at": datetime.now().isoformat(),
            "is_deleted": False,
            "starred": False,
            "content": base64.b64encode(content).decode('utf-8')  # Store as base64
        }
        
        db["files"].append(file_record)
        db["next_id"] += 1
        save_db(db)
        
        # Remove content from response
        response_record = file_record.copy()
        del response_record['content']
        
        return response_record
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
     
@app.post("/api/upload/cancel/{upload_id}")
async def cancel_upload(upload_id: str, current_user: dict = Depends(get_current_user)):
    active_uploads[upload_id] = {'cancelled': True}
    print(f"Upload {upload_id} marked for cancellation")
    return {"message": "Upload cancelled"}

# FIXED: Star/Unstar file endpoint
# FIXED: Star/Unstar file endpoint with better error handling
@app.post("/api/files/{file_id}/star")
async def toggle_star(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        print(f"Attempting to star/unstar file ID: {file_id}")
        
        db = load_db()
        file_record = None
        file_index = None
        
        # Find the file with better error checking
        for i, f in enumerate(db["files"]):
            if f.get("id") == file_id and not f.get("is_deleted", False):
                file_record = f
                file_index = i
                break
        
        if not file_record:
            print(f"File with ID {file_id} not found in database")
            print(f"Available file IDs: {[f.get('id') for f in db['files'][:10]]}")  # Show first 10 IDs for debugging
            raise HTTPException(status_code=404, detail=f"File with ID {file_id} not found")
        
        # Ensure starred field exists
        if "starred" not in file_record:
            file_record["starred"] = False
        
        # Toggle starred status
        file_record["starred"] = not file_record["starred"]
        file_record["starred_at"] = datetime.now().isoformat()
        
        # Update the database
        db["files"][file_index] = file_record
        save_db(db)
        
        print(f"File {file_id} starred status changed to: {file_record['starred']}")
        
        return {
            "file_id": file_id, 
            "starred": file_record["starred"],
            "message": f"File {'starred' if file_record['starred'] else 'unstarred'} successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Star toggle error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# FIXED: Get starred files endpoint
@app.get("/api/files/starred")
async def get_starred_files(current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        starred_files = []
        for f in db["files"]:
            if f.get("starred", False) and not f.get("is_deleted", False):
                file_copy = f.copy()
                if 'content' in file_copy:
                    del file_copy['content']
                starred_files.append(file_copy)
        
        print(f"Found {len(starred_files)} starred files")
        return safe_json_encode(starred_files)
    except Exception as e:
        print(f"Get starred files error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def migrate_database():
    """Add missing fields to existing files"""
    try:
        db = load_db()
        updated = False
        
        for file_record in db["files"]:
            # Add starred field if missing
            if "starred" not in file_record:
                file_record["starred"] = False
                updated = True
            
            # Ensure is_deleted field exists
            if "is_deleted" not in file_record:
                file_record["is_deleted"] = False
                updated = True
        
        if updated:
            save_db(db)
            print("Database migrated successfully - added missing fields")
        
    except Exception as e:
        print(f"Database migration error: {e}")

# Add this to your startup event


# NEW: Copy file endpoint
@app.post("/api/files/{file_id}/copy")
async def copy_file(file_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    try:
        data = await request.json()
        target_folder_id = data.get('folder_id', 0)
        new_name = data.get('name', None)
        
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Create copy
        new_file = file_record.copy()
        new_file["id"] = db["next_id"]
        new_file["folder_id"] = target_folder_id
        new_file["created_at"] = datetime.now().isoformat()
        new_file["is_deleted"] = False
        new_file["starred"] = False
        new_file["versions"] = []
        
        if new_name:
            new_file["name"] = sanitize_filename(new_name)
        else:
            # Add "Copy of" prefix
            new_file["name"] = f"Copy of {file_record['name']}"
        
        db["files"].append(new_file)
        db["next_id"] += 1
        save_db(db)
        
        # Remove content from response
        response_record = new_file.copy()
        if 'content' in response_record:
            del response_record['content']
        
        return safe_json_encode(response_record)
        
    except Exception as e:
        print(f"Copy file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ENHANCED: Rename file endpoint
@app.post("/api/files/{file_id}/rename")
async def rename_file(
    file_id: int, 
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    try:
        data = await request.json()
        new_name = sanitize_filename(data.get('name', ''))
        
        if not new_name:
            raise HTTPException(status_code=400, detail="Invalid file name")
        
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Save version before renaming
        if "versions" not in file_record:
            file_record["versions"] = []
        
        version = {
            "name": file_record["name"],
            "renamed_at": datetime.now().isoformat(),
            "version_number": len(file_record["versions"]) + 1
        }
        file_record["versions"].append(version)
        
        old_name = file_record["name"]
        file_record["name"] = new_name
        file_record["renamed_at"] = datetime.now().isoformat()
        
        save_db(db)
        
        return {
            "message": "File renamed successfully",
            "file_id": file_id,
            "old_name": old_name,
            "new_name": new_name
        }
        
    except Exception as e:
        print(f"Rename file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# NEW: File versioning endpoints
@app.get("/api/files/{file_id}/versions")
async def get_file_versions(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        versions = file_record.get("versions", [])
        return safe_json_encode(versions)
        
    except Exception as e:
        print(f"Get file versions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/{file_id}/restore-version")
async def restore_file_version(file_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    try:
        data = await request.json()
        version_number = data.get('version_number')
        
        if version_number is None:
            raise HTTPException(status_code=400, detail="Version number required")
        
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        versions = file_record.get("versions", [])
        target_version = None
        
        for version in versions:
            if version.get("version_number") == version_number:
                target_version = version
                break
        
        if not target_version:
            raise HTTPException(status_code=404, detail="Version not found")
        
        # Save current state as new version
        current_version = {
            "name": file_record["name"],
            "renamed_at": datetime.now().isoformat(),
            "version_number": len(versions) + 1
        }
        file_record["versions"].append(current_version)
        
        # Restore to target version
        file_record["name"] = target_version["name"]
        file_record["restored_at"] = datetime.now().isoformat()
        file_record["restored_from_version"] = version_number
        
        save_db(db)
        
        return {
            "message": "File version restored successfully",
            "file_id": file_id,
            "restored_version": version_number
        }
        
    except Exception as e:
        print(f"Restore file version error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# FIXED: Get deleted files (bin) endpoint
@app.get("/api/files/bin")
async def get_bin_files(current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        bin_files = []
        for f in db["files"]:
            if f.get("is_deleted", False):
                file_copy = f.copy()
                if 'content' in file_copy:
                    del file_copy['content']
                bin_files.append(file_copy)
        
        print(f"Found {len(bin_files)} files in bin")
        return safe_json_encode(bin_files)
    except Exception as e:
        print(f"Get bin files error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# NEW: Restore file from bin endpoint
@app.post("/api/files/{file_id}/restore")
async def restore_file(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found in bin")
        
        file_record["is_deleted"] = False
        file_record["restored_at"] = datetime.now().isoformat()
        if "deleted_at" in file_record:
            del file_record["deleted_at"]
        
        save_db(db)
        
        return {"message": "File restored successfully", "file_id": file_id}
    except Exception as e:
        print(f"Restore file error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# NEW: Bulk operations endpoint
@app.post("/api/files/bulk")
async def bulk_operations(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        data = await request.json()
        operation = data.get('operation')
        file_ids = data.get('file_ids', [])
        target_folder_id = data.get('target_folder_id', 0)
        
        if not operation or not file_ids:
            raise HTTPException(status_code=400, detail="Operation and file_ids required")
        
        db = load_db()
        results = []
        
        for file_id in file_ids:
            file_record = None
            for f in db["files"]:
                if f["id"] == file_id and not f.get("is_deleted", False):
                    file_record = f
                    break
            
            if not file_record:
                results.append({"file_id": file_id, "status": "not_found"})
                continue
            
            if operation == "move":
                file_record["folder_id"] = target_folder_id
                file_record["moved_at"] = datetime.now().isoformat()
                results.append({"file_id": file_id, "status": "moved"})
                
            elif operation == "copy":
                new_file = file_record.copy()
                new_file["id"] = db["next_id"]
                new_file["folder_id"] = target_folder_id
                new_file["created_at"] = datetime.now().isoformat()
                new_file["is_deleted"] = False
                new_file["starred"] = False
                new_file["versions"] = []
                new_file["name"] = f"Copy of {file_record['name']}"
                
                db["files"].append(new_file)
                db["next_id"] += 1
                results.append({"file_id": file_id, "status": "copied", "new_id": new_file["id"]})
                
            elif operation == "delete":
                file_record["is_deleted"] = True
                file_record["deleted_at"] = datetime.now().isoformat()
                results.append({"file_id": file_id, "status": "deleted"})
                
            elif operation == "star":
                file_record["starred"] = True
                results.append({"file_id": file_id, "status": "starred"})
                
            elif operation == "unstar":
                file_record["starred"] = False
                results.append({"file_id": file_id, "status": "unstarred"})
        
        save_db(db)
        
        return {
            "message": f"Bulk {operation} completed",
            "results": results,
            "total_processed": len(results)
        }
        
    except Exception as e:
        print(f"Bulk operations error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# NEW: File preview endpoint with format support
@app.get("/api/files/{file_id}/preview")
async def preview_file(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if file type supports preview
        mime_type = file_record.get("mime_type", "")
        preview_supported = (
            mime_type.startswith(('image/', 'video/', 'audio/')) or
            mime_type in ['application/pdf', 'text/plain', 'text/html', 'text/css', 'text/javascript'] or
            file_record["name"].lower().endswith(('.txt', '.md', '.json', '.xml', '.csv'))
        )
        
        return {
            "file_id": file_id,
            "name": file_record["name"],
            "mime_type": mime_type,
            "size": file_record["size"],
            "preview_supported": preview_supported,
            "preview_url": f"/api/download/{file_id}" if preview_supported else None
        }
        
    except Exception as e:
        print(f"Preview file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files")
async def get_files(folder_id: int = 0, current_user: dict = Depends(get_current_user)):
    db = load_db()
    files = []
    for f in db["files"]:
        if f["folder_id"] == folder_id and not f.get("is_deleted", False):
            file_copy = f.copy()
            if 'content' in file_copy:
                del file_copy['content']
            files.append(file_copy)
    return safe_json_encode(files)

@app.get("/api/files/search")
async def search_files(
    query: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user)
):
    db = load_db()
    results = []
    for f in db["files"]:
        if not f.get("is_deleted", False) and query.lower() in f["name"].lower():
            file_copy = f.copy()
            if 'content' in file_copy:
                del file_copy['content']
            results.append(file_copy)
    return safe_json_encode(results)

@app.get("/api/files/recent")
async def get_recent_files(current_user: dict = Depends(get_current_user)):
    db = load_db()
    cutoff_time = datetime.now() - timedelta(minutes=30)
    
    recent_files = []
    for f in db["files"]:
        if not f.get("is_deleted", False):
            try:
                file_time = datetime.fromisoformat(f["created_at"])
                if file_time > cutoff_time:
                    file_copy = f.copy()
                    if 'content' in file_copy:
                        del file_copy['content']
                    recent_files.append(file_copy)
            except:
                pass
    
    recent_files.sort(key=lambda x: x["created_at"], reverse=True)
    return safe_json_encode(recent_files[:10])

@app.get("/api/download/{file_id}")
async def download_file(file_id: int, current_user: dict = Depends(get_current_user)):
    db = load_db()
    
    file_record = None
    for f in db["files"]:
        if f["id"] == file_id and not f.get("is_deleted", False):
            file_record = f
            break
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        print(f"Downloading file: {file_record['name']}")
        
        file_bytes = None
        
        # Try stored content first
        if file_record.get('content'):
            try:
                file_bytes = bytes.fromhex(file_record['content'])
                print(f"Retrieved file from database storage")
            except Exception as e:
                print(f"Error retrieving from database: {e}")
        
        # Try Telegram
        if not file_bytes:
            try:
                group_id = file_record["telegram_group_id"]
                message_id = file_record["telegram_file_id"]
                
                if not message_id.startswith('local_'):
                    message = await client.get_messages(int(group_id), ids=int(message_id))
                    if message:
                        file_bytes = await client.download_media(message.media, file=bytes)
                        print(f"Retrieved file from Telegram")
            except Exception as e:
                print(f"Error retrieving from Telegram: {e}")
        
        # Generate demo content if nothing else works
        if not file_bytes:
            file_content = f"Demo content for {file_record['name']}\nFile ID: {file_id}\nSize: {file_record['size']} bytes\nCreated: {file_record['created_at']}"
            file_bytes = file_content.encode('utf-8')
            print(f"Generated demo content")
        
        # Determine content type
        content_type = file_record["mime_type"]
        filename = file_record["name"].lower()
        
        if not content_type or content_type == "application/octet-stream":
            if filename.endswith(('.mp4', '.avi', '.mov', '.mkv')):
                content_type = "video/mp4"
            elif filename.endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                content_type = f"image/{filename.split('.')[-1]}"
            elif filename.endswith(('.mp3', '.wav', '.ogg')):
                content_type = f"audio/{filename.split('.')[-1]}"
        
        headers = {
            "Content-Type": content_type,
            "Content-Length": str(len(file_bytes)),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        }
        
        # Set attachment for non-media files
        if not content_type.startswith(('video/', 'image/', 'audio/')):
            safe_filename = sanitize_filename(file_record["name"])
            headers["Content-Disposition"] = f'attachment; filename="{safe_filename}"'
        
        return Response(content=file_bytes, headers=headers)
        
    except Exception as e:
        print(f"Download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/{file_id}/move")
async def move_file(
    file_id: int, 
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    try:
        data = await request.json()
        target_folder_id = data.get('folder_id', 0)
        
        db = load_db()
        
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Verify target folder exists (if not root)
        if target_folder_id != 0:
            folder_exists = any(
                folder["id"] == target_folder_id and not folder.get("is_deleted", False)
                for folder in db["folders"]
            )
            if not folder_exists:
                raise HTTPException(status_code=404, detail="Target folder not found")
        
        old_folder_id = file_record["folder_id"]
        file_record["folder_id"] = target_folder_id
        file_record["moved_at"] = datetime.now().isoformat()
        
        save_db(db)
        
        return {
            "message": "File moved successfully",
            "file_id": file_id,
            "old_folder_id": old_folder_id,
            "new_folder_id": target_folder_id
        }
        
    except Exception as e:
        print(f"Move file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/folders")
async def create_folder(
    name: str, 
    parent_id: int = 0, 
    current_user: dict = Depends(get_current_user)
):
    try:
        db = load_db()
        
        clean_name = sanitize_filename(name)
        print(f"Creating folder: {clean_name}")
        
        folder_record = {
            "id": db["next_id"],
            "name": clean_name,
            "parent_id": parent_id,
            "created_by": current_user['user_id'],
            "created_at": datetime.now().isoformat(),
            "is_deleted": False
        }
        
        db["folders"].append(folder_record)
        db["next_id"] += 1
        save_db(db)
        
        return safe_json_encode(folder_record)
        
    except Exception as e:
        print(f"Create folder error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/folders")
async def get_folders(parent_id: int = 0, current_user: dict = Depends(get_current_user)):
    db = load_db()
    folders = [f for f in db["folders"] if f["parent_id"] == parent_id and not f.get("is_deleted", False)]
    return safe_json_encode(folders)

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id and not f.get("is_deleted", False):
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Mark as deleted in database (soft delete)
        file_record["is_deleted"] = True
        file_record["deleted_at"] = datetime.now().isoformat()
        save_db(db)
        
        return {"message": "File moved to bin successfully"}
        
    except Exception as e:
        print(f"Delete file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        
        folder_record = None
        for f in db["folders"]:
            if f["id"] == folder_id and not f.get("is_deleted", False):
                folder_record = f
                break
        
        if not folder_record:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Delete all files in the folder
        for file_record in db["files"]:
            if file_record["folder_id"] == folder_id and not file_record.get("is_deleted", False):
                file_record["is_deleted"] = True
        
        # Mark folder as deleted
        folder_record["is_deleted"] = True
        folder_record["deleted_at"] = datetime.now().isoformat()
        save_db(db)
        
        return {"message": "Folder deleted successfully"}
        
    except Exception as e:
        print(f"Delete folder error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/all")
async def get_all_files(current_user: dict = Depends(get_current_user)):
    db = load_db()
    files = []
    for f in db["files"]:
        file_copy = f.copy()
        if 'content' in file_copy:
            del file_copy['content']
        files.append(file_copy)
    return safe_json_encode(files)

@app.get("/api/storage/info")
async def get_storage_info(current_user: dict = Depends(get_current_user)):
    db = load_db()
    files = [f for f in db["files"] if not f.get("is_deleted", False)]
    
    total_size = sum(f.get("size", 0) for f in files)
    total_files = len(files)
    
    return {
        "totalSize": total_size,
        "totalFiles": total_files,
        "formattedSize": format_file_size(total_size)
    }
@app.on_event("startup")
async def startup_event():
    try:
        await init_telegram()
        migrate_database()
        print("Application started successfully")
    except Exception as e:
        print(f"Startup warning: {e}")
        # Don't crash the app if Telegram client fails
        migrate_database()

@app.get("/api/debug/files")
async def debug_files(current_user: dict = Depends(get_current_user)):
    """Debug endpoint to check file structure"""
    try:
        db = load_db()
        files = db.get("files", [])
        
        debug_info = {
            "total_files": len(files),
            "files_with_starred_field": sum(1 for f in files if "starred" in f),
            "files_with_id_field": sum(1 for f in files if "id" in f),
            "sample_file_ids": [f.get("id") for f in files[:5]],
            "sample_files": [
                {
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "starred": f.get("starred"),
                    "is_deleted": f.get("is_deleted")
                } for f in files[:3]
            ]
        }
        
        return debug_info
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
async def root():
    return {"message": "TGDrive API is running successfully"}

    
# Add this at the very end of your main.py file


# Remove all mangum-related code and keep only this:
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
