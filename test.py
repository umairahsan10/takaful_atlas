import pymupdf

doc = pymupdf.open("C:\\Users\\umair\\Downloads\\Sample Claim 1.1.pdf")

for page_index in range(len(doc)):
    page = doc[page_index]
    images = page.get_images(full=True)

    for img in images:
        xref = img[0]
        base = doc.extract_image(xref)
        print(base["ext"])
