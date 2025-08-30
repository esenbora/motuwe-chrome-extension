import base64

# Base64 encoded 1x1 green pixel PNG
green_pixel = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8O\xea0\x00\x00\x02\xa1\x01E\xb5\x18\xc9\x00\x00\x00\x00IEND\xaeB`\x82'

# Simple green square PNG for each size
def create_icon(size, filename):
    # PNG header
    header = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    import struct
    import zlib
    
    width = size
    height = size
    bit_depth = 8
    color_type = 2  # RGB
    compression = 0
    filter_method = 0
    interlace = 0
    
    ihdr_data = struct.pack('>IIBBBBB', width, height, bit_depth, color_type, compression, filter_method, interlace)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk (green color)
    scanlines = []
    for y in range(height):
        scanline = b'\x00'  # filter type none
        for x in range(width):
            # Green color (R=76, G=175, B=80) - Material Green
            scanline += b'\x4c\xaf\x50'
        scanlines.append(scanline)
    
    raw_data = b''.join(scanlines)
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    idat_chunk = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    # Complete PNG
    png_data = header + ihdr_chunk + idat_chunk + iend_chunk
    
    with open(filename, 'wb') as f:
        f.write(png_data)
    print(f"Created {filename}")

# Create all icon sizes
create_icon(16, 'icon16.png')
create_icon(32, 'icon32.png')
create_icon(48, 'icon48.png')
create_icon(128, 'icon128.png')