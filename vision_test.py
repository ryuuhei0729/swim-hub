from google.cloud import vision

def detect_text(path):
    client = vision.ImageAnnotatorClient()

    with open(path, "rb") as image_file:
        content = image_file.read()

    image = vision.Image(content=content)
    response = client.text_detection(image=image)

    texts = response.text_annotations
    print("=== OCR RESULT ===")
    if texts:
        print(texts[0].description)  # 全文
    else:
        print("No text detected")

detect_text("/Users/ryuuhei_0729/Downloads/IMG_7891 (1).jpg")  # ← ここをあなたの画像に変更
