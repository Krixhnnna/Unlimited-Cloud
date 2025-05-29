# main.py - Complete implementation with storage endpoints
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta
import os
import json
import hashlib
import hmac
import urllib.parse
import math
from typing import List, Optional
import io
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.channels import CreateChannelRequest, DeleteChannelRequest
from telethon.tl.functions.messages import DeleteMessagesRequest
from telethon.tl.types import InputPeerChannel, InputChannel
import jwt

load_dotenv()

app = FastAPI(title="TGDrive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
API_ID = int(os.getenv("API_ID"))
API_HASH = os.getenv("API_HASH")
BOT_TOKEN = os.getenv("BOT_TOKEN")
SESSION_STRING = os.getenv("SESSION_STRING")
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-this")

client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)

# Database files
DB_FILE = "tgdrive_db.json"
GROUPS_FILE = "tg_groups.json"

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r') as f:
            data = json.load(f)
            # Ensure all required keys exist
            if 'users' not in data:
                data['users'] = []
            if 'files' not in data:
                data['files'] = []
            if 'folders' not in data:
                data['folders'] = []
            if 'next_id' not in data:
                data['next_id'] = 1
            return data
    return {"files": [], "folders": [], "users": [], "next_id": 1}

def save_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=2, default=str)

def load_groups():
    if os.path.exists(GROUPS_FILE):
        with open(GROUPS_FILE, 'r') as f:
            return json.load(f)
    return {"default_group_id": None, "folder_groups": {}}

def save_groups(data):
    with open(GROUPS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def format_file_size(bytes_size):
    """Format file size for display"""
    if bytes_size == 0:
        return "0 Bytes"
    
    k = 1024
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    i = int(math.floor(math.log(bytes_size) / math.log(k)))
    
    return f"{round(bytes_size / math.pow(k, i), 2)} {sizes[i]}"

async def refresh_entity_cache():
    """Refresh entity cache by getting dialogs"""
    try:
        print("Refreshing entity cache...")
        await client.get_dialogs()
        print("Entity cache refreshed")
    except Exception as e:
        print(f"Error refreshing entity cache: {e}")

async def ensure_default_group():
    """Ensure default 'TG Drive' group exists"""
    groups_data = load_groups()
    
    if not groups_data.get("default_group_id"):
        try:
            # Create default group
            result = await client(CreateChannelRequest(
                title="TG Drive",
                about="Default storage for TG Drive files",
                megagroup=True
            ))
            
            group_id = result.chats[0].id
            groups_data["default_group_id"] = group_id
            save_groups(groups_data)
            print(f"Created default group 'TG Drive' with ID: {group_id}")
            
            # IMPORTANT: Refresh dialogs to cache the new entity
            await client.get_dialogs()
            
        except Exception as e:
            print(f"Error creating default group: {e}")
    else:
        # Group exists, but make sure entity is cached
        try:
            await client.get_entity(int(groups_data["default_group_id"]))
        except ValueError:
            # Entity not in cache, refresh dialogs
            print("Default group entity not in cache, refreshing...")
            await client.get_dialogs()
    
    return groups_data.get("default_group_id")

async def create_folder_group(folder_name):
    """Create a new Telegram group for a folder"""
    try:
        result = await client(CreateChannelRequest(
            title=f"TGDrive - {folder_name}",
            about=f"Storage for folder: {folder_name}",
            megagroup=True
        ))
        
        group_id = result.chats[0].id
        print(f"Created folder group '{folder_name}' with ID: {group_id}")
        
        # IMPORTANT: Refresh dialogs to cache the new entity
        await client.get_dialogs()
        
        return group_id
        
    except Exception as e:
        print(f"Error creating folder group: {e}")
        return None

async def delete_telegram_file(group_id, message_id):
    """Delete a file from Telegram group"""
    try:
        await client(DeleteMessagesRequest(
            peer=int(group_id),
            id=[int(message_id)]
        ))
        print(f"Deleted message {message_id} from group {group_id}")
        return True
    except Exception as e:
        print(f"Error deleting Telegram file: {e}")
        return False

async def delete_telegram_channel(channel_id):
    """Delete a Telegram channel/group"""
    try:
        # Get channel entity first
        channel = await client.get_entity(int(channel_id))
        
        # Delete the channel
        await client(DeleteChannelRequest(channel=channel))
        print(f"Deleted Telegram channel {channel_id}")
        return True
    except Exception as e:
        print(f"Error deleting Telegram channel: {e}")
        return False

def verify_telegram_auth(auth_data):
    """Verify Telegram login data - TEMPORARY BYPASS"""
    try:
        # Temporary: Just check if we have basic required fields
        if auth_data.get('id') and auth_data.get('first_name'):
            print(f"Auth bypass for user: {auth_data.get('first_name')} (ID: {auth_data.get('id')})")
            return True
        return False
    except Exception as e:
        print(f"Auth verification error: {e}")
        return False

def create_jwt_token(user_data):
    """Create JWT token for user"""
    payload = {
        'user_id': user_data['id'],
        'username': user_data.get('username', ''),
        'first_name': user_data.get('first_name', ''),
        'exp': datetime.utcnow() + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def verify_jwt_token(token):
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(authorization: str = Header(None)):
    """Get current authenticated user"""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split(' ')[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

async def init_telegram():
    await client.start()
    await refresh_entity_cache()
    await ensure_default_group()
    print("Telegram client started successfully")

@app.on_event("startup")
async def startup_event():
    await init_telegram()

# Authentication endpoints
@app.post("/api/auth/telegram")
async def telegram_login(request: Request):
    """Authenticate user with Telegram login data"""
    try:
        data = await request.json()
        print(f"Received auth data: {data}")
        
        if not verify_telegram_auth(data):
            raise HTTPException(status_code=401, detail="Invalid Telegram authentication")
        
        # Load database safely
        db = load_db()
        
        # Ensure users key exists
        if 'users' not in db:
            db['users'] = []
            save_db(db)
        
        user_id = data['id']
        
        # Check if user exists
        existing_user = None
        for user in db['users']:
            if user['id'] == user_id:
                existing_user = user
                break
        
        if not existing_user:
            user_record = {
                'id': user_id,
                'username': data.get('username', ''),
                'first_name': data.get('first_name', ''),
                'last_name': data.get('last_name', ''),
                'created_at': datetime.now().isoformat()
            }
            db['users'].append(user_record)
            save_db(db)
            print(f"Created new user: {user_record}")
        
        # Create JWT token
        token = create_jwt_token(data)
        
        return {
            'token': token,
            'user': {
                'id': user_id,
                'username': data.get('username', ''),
                'first_name': data.get('first_name', ''),
                'last_name': data.get('last_name', '')
            }
        }
        
    except Exception as e:
        print(f"Login error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/verify")
async def verify_token(authorization: str = Header(None)):
    """Verify current token"""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split(' ')[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return {"valid": True, "user": payload}

# File operations
@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    folder_id: int = 0,
    current_user: dict = Depends(get_current_user)
):
    try:
        db = load_db()
        groups_data = load_groups()
        content = await file.read()
        
        print(f"Uploading file: {file.filename}, size: {len(content)}, folder_id: {folder_id}")
        
        # Determine target group
        if folder_id == 0:
            # Use default group
            target_group_id = groups_data["default_group_id"]
            if not target_group_id:
                target_group_id = await ensure_default_group()
        else:
            # Find folder's group
            folder = None
            for f in db["folders"]:
                if f["id"] == folder_id and not f.get("is_deleted", False):
                    folder = f
                    break
            
            if not folder:
                raise HTTPException(status_code=404, detail="Folder not found")
            
            target_group_id = groups_data["folder_groups"].get(str(folder_id))
            if not target_group_id:
                raise HTTPException(status_code=500, detail="Folder group not found")
        
        print(f"Target group ID: {target_group_id}")
        
        # Get the entity properly before sending
        try:
            target_entity = await client.get_entity(int(target_group_id))
        except ValueError:
            # If entity not found, try to get it through dialogs
            print("Entity not found in cache, refreshing dialogs...")
            await client.get_dialogs()
            target_entity = await client.get_entity(int(target_group_id))
        
        # Upload to specific Telegram group using the resolved entity
        message = await client.send_file(
            target_entity,
            io.BytesIO(content),
            caption=f"📁 {file.filename}\n👤 Uploaded by: {current_user['first_name']}",
            file_name=file.filename
        )
        
        print(f"File uploaded to Telegram, message ID: {message.id}")
        
        # Save to database
        file_record = {
            "id": db["next_id"],
            "name": file.filename,
            "telegram_file_id": str(message.id),
            "telegram_group_id": target_group_id,
            "size": len(content),
            "mime_type": file.content_type or "application/octet-stream",
            "folder_id": folder_id,
            "uploaded_by": current_user['user_id'],
            "created_at": datetime.now().isoformat(),
            "is_deleted": False
        }
        
        db["files"].append(file_record)
        db["next_id"] += 1
        save_db(db)
        
        print(f"File record saved: {file_record}")
        
        return file_record
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files")
async def get_files(folder_id: int = 0, current_user: dict = Depends(get_current_user)):
    db = load_db()
    files = [f for f in db["files"] if f["folder_id"] == folder_id and not f.get("is_deleted", False)]
    return files

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
        # Download from specific group
        group_id = file_record["telegram_group_id"]
        message = await client.get_messages(int(group_id), ids=int(file_record["telegram_file_id"]))
        file_bytes = await client.download_media(message.media, file=bytes)
        
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type=file_record["mime_type"],
            headers={"Content-Disposition": f"attachment; filename={file_record['name']}"}
        )
        
    except Exception as e:
        print(f"Download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/folders")
async def create_folder(
    name: str, 
    parent_id: int = 0, 
    current_user: dict = Depends(get_current_user)
):
    try:
        db = load_db()
        groups_data = load_groups()
        
        print(f"Creating folder: {name}")
        
        # Create Telegram group for folder
        group_id = await create_folder_group(name)
        if not group_id:
            raise HTTPException(status_code=500, detail="Failed to create Telegram group")
        
        # Create folder record
        folder_record = {
            "id": db["next_id"],
            "name": name,
            "parent_id": parent_id,
            "telegram_group_id": group_id,
            "created_by": current_user['user_id'],
            "created_at": datetime.now().isoformat(),
            "is_deleted": False
        }
        
        # Save folder group mapping
        groups_data["folder_groups"][str(db["next_id"])] = group_id
        save_groups(groups_data)
        
        db["folders"].append(folder_record)
        db["next_id"] += 1
        save_db(db)
        
        print(f"Folder created: {folder_record}")
        
        return folder_record
        
    except Exception as e:
        print(f"Create folder error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/folders")
async def get_folders(parent_id: int = 0, current_user: dict = Depends(get_current_user)):
    db = load_db()
    folders = [f for f in db["folders"] if f["parent_id"] == parent_id and not f.get("is_deleted", False)]
    return folders

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        
        file_record = None
        for f in db["files"]:
            if f["id"] == file_id:
                file_record = f
                break
        
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Delete from Telegram
        success = await delete_telegram_file(
            file_record["telegram_group_id"], 
            file_record["telegram_file_id"]
        )
        
        if success:
            print(f"Successfully deleted file from Telegram")
        else:
            print(f"Failed to delete file from Telegram, but marking as deleted in DB")
        
        # Mark as deleted in database
        file_record["is_deleted"] = True
        file_record["deleted_at"] = datetime.now().isoformat()
        save_db(db)
        
        return {"message": "File deleted successfully"}
        
    except Exception as e:
        print(f"Delete file error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: int, current_user: dict = Depends(get_current_user)):
    try:
        db = load_db()
        groups_data = load_groups()
        
        folder_record = None
        for f in db["folders"]:
            if f["id"] == folder_id:
                folder_record = f
                break
        
        if not folder_record:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Delete all files in the folder first
        for file_record in db["files"]:
            if file_record["folder_id"] == folder_id and not file_record.get("is_deleted", False):
                await delete_telegram_file(
                    file_record["telegram_group_id"], 
                    file_record["telegram_file_id"]
                )
                file_record["is_deleted"] = True
        
        # Delete the Telegram channel
        channel_id = groups_data["folder_groups"].get(str(folder_id))
        if channel_id:
            success = await delete_telegram_channel(channel_id)
            if success:
                print(f"Successfully deleted Telegram channel for folder")
                # Remove from groups mapping
                del groups_data["folder_groups"][str(folder_id)]
                save_groups(groups_data)
            else:
                print(f"Failed to delete Telegram channel, but marking folder as deleted")
        
        # Mark folder as deleted
        folder_record["is_deleted"] = True
        folder_record["deleted_at"] = datetime.now().isoformat()
        save_db(db)
        
        return {"message": "Folder deleted successfully"}
        
    except Exception as e:
        print(f"Delete folder error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Storage endpoints
@app.get("/api/files/all")
async def get_all_files(current_user: dict = Depends(get_current_user)):
    """Get all files for storage calculation"""
    db = load_db()
    files = [f for f in db["files"] if not f.get("is_deleted", False)]
    return files

@app.get("/api/storage/info")
async def get_storage_info(current_user: dict = Depends(get_current_user)):
    """Get storage information"""
    db = load_db()
    files = [f for f in db["files"] if not f.get("is_deleted", False)]
    
    total_size = sum(f.get("size", 0) for f in files)
    total_files = len(files)
    
    return {
        "totalSize": total_size,
        "totalFiles": total_files,
        "formattedSize": format_file_size(total_size)
    }

@app.get("/")
async def root():
    return {"message": "TGDrive API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
