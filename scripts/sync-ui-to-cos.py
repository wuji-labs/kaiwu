import os
import mimetypes
from pathlib import Path
from qcloud_cos import CosConfig, CosS3Client

secret_id = os.environ.get('COS_SECRET_ID')
secret_key = os.environ.get('COS_SECRET_KEY')
if not secret_id or not secret_key:
    raise SystemExit("COS_SECRET_ID/COS_SECRET_KEY not set; source D:\\Projects\\qianyuan-wuji\\secrets\\kaiwu-server\\cos.env")

region = os.environ.get('COS_REGION', 'ap-shanghai')
bucket = os.environ.get('COS_BUCKET', 'kaiwu-static-1444025891')

config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
client = CosS3Client(config)

dist_dir = Path('D:/Projects/wuji-labs-app/apps/ui/dist')
files = [p for p in dist_dir.rglob('*') if p.is_file()]

print(f"Total files to sync to COS: {len(files)}")
uploaded = 0
for p in files:
    rel_path = p.relative_to(dist_dir).as_posix()
    # COS key structure for UI assets
    cos_key = f"web/{rel_path}"
    content_type, _ = mimetypes.guess_type(str(p))
    if str(p).endswith('.wasm'):
        content_type = 'application/wasm'
    elif str(p).endswith('.js'):
        content_type = 'application/javascript'
    elif str(p).endswith('.css'):
        content_type = 'text/css'
    elif str(p).endswith('.html'):
        content_type = 'text/html'
    elif not content_type:
        content_type = 'application/octet-stream'

    with open(p, 'rb') as fp:
        client.put_object(
            Bucket=bucket,
            Body=fp,
            Key=cos_key,
            ContentType=content_type,
            CacheControl='public, max-age=31536000, immutable' if '_expo' in rel_path or 'assets' in rel_path else 'no-cache'
        )
    uploaded += 1
    if uploaded % 50 == 0 or uploaded == len(files):
        print(f"Uploaded {uploaded}/{len(files)}...")

print("COS sync completed!")
