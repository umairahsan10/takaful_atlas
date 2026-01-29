"use client";

import { useState, useRef } from "react";
import { extractImageFromPDF, blobToFile } from "../utils/pdf-extractor";

interface ClaimFormData {
  // Claimant Information
  claimantName: string;
  employeeId: string;
  employeeCNIC: string;
  participantEmployerName: string;
  planNumber: string;

  // Patient Information
  patientName: string;
  patientGender: string;
  patientTakafulCertificateNumber: string;
  patientDateOfBirth: string;
  patientCNIC: string;
  patientRelationship: string;
  mobile: string;

  // Claim Type
  claimTypeOPD: string;
  claimTypeHospitalization: string;
  claimTypePrePostHospitalization: string;
  claimTypeMaternity: string;
  claimTypePrePostNatal: string;

  // Medical Condition
  natureOfMedicalCondition: string;
  symptomsOrCause: string;

  // Hospital/Treatment Details
  hospitalClinicName: string;
  dateOfAdmission: string;
  dateOfDischarge: string;

  // Claim Amount
  totalClaimAmount: string;
  totalNumberOfDays: string;
  titleOfCheque: string;
  payable_to_employee: string;
  payable_to_employer: string;
}

const INITIAL_FORM_DATA: ClaimFormData = {
  claimantName: "",
  employeeId: "",
  employeeCNIC: "",
  participantEmployerName: "",
  planNumber: "",
  patientName: "",
  patientGender: "",
  patientTakafulCertificateNumber: "",
  patientDateOfBirth: "",
  patientCNIC: "",
  patientRelationship: "",
  mobile: "",
  claimTypeOPD: "",
  claimTypeHospitalization: "",
  claimTypePrePostHospitalization: "",
  claimTypeMaternity: "",
  claimTypePrePostNatal: "",
  natureOfMedicalCondition: "",
  symptomsOrCause: "",
  hospitalClinicName: "",
  dateOfAdmission: "",
  dateOfDischarge: "",
  totalClaimAmount: "",
  totalNumberOfDays: "",
  titleOfCheque: "",
  payable_to_employee: "",
  payable_to_employer: "",
};

export default function DocumentExtractor() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<ClaimFormData>(INITIAL_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [extractionTime, setExtractionTime] = useState<number | null>(null);
  const [uploadMode, setUploadMode] = useState<"image" | "pdf">("pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number | null>(null);

  const extractTextFromImage = async (
    file: File,
  ): Promise<Record<string, string>> => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Send image to external OCR endpoint
      const response = await fetch(
        "https://unperfidious-clemmie-unfractiously.ngrok-free.dev/ocr",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "OCR Service: Endpoint not found (404). Please contact support.",
          );
        } else if (response.status === 500) {
          throw new Error(
            "OCR Service: Server error (500). Please try again later.",
          );
        } else if (response.status === 503) {
          throw new Error(
            "OCR Service: Service temporarily unavailable (503). Please try again later.",
          );
        } else if (response.status === 0 || response.statusText === "") {
          throw new Error(
            "OCR Server: Connection failed. The server may not be running. Please ensure the OCR service is started.",
          );
        }
        throw new Error(
          `OCR Service Error (${response.status}): ${response.statusText || "Unknown error"}`,
        );
      }

      const data = await response.json();

      // Log the raw response
      console.log("OCR Raw Response:", data);

      // Extract the JSON from the text field
      if (!data.text) {
        throw new Error(
          "OCR Response: No text data received. The document may not contain extractable information.",
        );
      }

      // Find the JSON block within the text (wrapped in ```json ... ```)
      const jsonMatch = data.text.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch || !jsonMatch[1]) {
        throw new Error(
          "OCR Response: Invalid data format. The extracted data could not be parsed. Please try another document.",
        );
      }

      const extractedJson = JSON.parse(jsonMatch[1]);
      console.log("Parsed JSON:", extractedJson);

      // Map snake_case keys to camelCase for form fields
      const mappedData: Record<string, string> = {};

      const snakeToCamelMapping: Record<string, keyof ClaimFormData> = {
        claimant_name: "claimantName",
        employee_id: "employeeId",
        employee_cnic: "employeeCNIC",
        participant_employer_name: "participantEmployerName",
        plan_number: "planNumber",
        patient_name: "patientName",
        patient_gender: "patientGender",
        patient_takaful_certificate_number: "patientTakafulCertificateNumber",
        patient_date_of_birth: "patientDateOfBirth",
        patient_cnic: "patientCNIC",
        patient_relationship: "patientRelationship",
        mobile: "mobile",
        claim_type_opd: "claimTypeOPD",
        claim_type_hospitalization: "claimTypeHospitalization",
        claim_type_pre_post_hospitalization: "claimTypePrePostHospitalization",
        claim_type_maternity: "claimTypeMaternity",
        claim_type_pre_post_natal: "claimTypePrePostNatal",
        nature_of_medical_condition: "natureOfMedicalCondition",
        symptoms_cause_duration: "symptomsOrCause",
        hospital_or_clinic_name: "hospitalClinicName",
        date_of_admission: "dateOfAdmission",
        date_of_discharge: "dateOfDischarge",
        total_number_of_days: "totalNumberOfDays",
        total_claim_amount_pkr: "totalClaimAmount",
        title_of_cheque: "titleOfCheque",
        payable_to_employee: "payable_to_employee",
        payable_to_employer: "payable_to_employer",
      };

      Object.entries(extractedJson).forEach(([key, value]) => {
        const camelCaseKey =
          snakeToCamelMapping[key as keyof typeof snakeToCamelMapping];
        if (camelCaseKey) {
          mappedData[camelCaseKey] = String(value);
        }
      });

      console.log("Mapped Form Data:", mappedData);
      return mappedData;
    } catch (err) {
      if (err instanceof TypeError) {
        if (err.message.includes("fetch")) {
          throw new Error(
            "Network Error: Could not connect to OCR server. Please ensure the server is running and try again.",
          );
        }
        throw new Error(
          "Network Error: Connection failed. Please check your internet connection.",
        );
      }
      if (err instanceof SyntaxError) {
        throw new Error(
          "Data Format Error: Invalid response from OCR server. Please try again.",
        );
      }
      throw err instanceof Error
        ? err
        : new Error(
            "Unexpected Error: Failed to extract text. Please try again.",
          );
    } finally {
      setIsLoading(false);
    }
  };

  const mapExtractedDataToForm = (extractedData: Record<string, string>) => {
    const newFormData = { ...INITIAL_FORM_DATA };

    // Direct mapping since extractTextFromImage already returns camelCase keys
    Object.entries(extractedData).forEach(([key, value]) => {
      if (key in INITIAL_FORM_DATA) {
        let formattedValue = String(value);

        // Convert date format from DD-MM-YYYY to YYYY-MM-DD for date input
        if (key === "patientDateOfBirth" && value) {
          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            // Assuming format is DD-MM-YYYY
            const [day, month, year] = dateParts;
            formattedValue = `${year}-${month}-${day}`;
          }
        }

        // Validate patient takaful certificate number - should be exactly 3 digits
        if (key === "patientTakafulCertificateNumber" && value) {
          const digitsOnly = value.replace(/\D/g, "");
          if (digitsOnly.length > 3) {
            formattedValue = "";
          } else {
            formattedValue = digitsOnly;
          }
        }

        newFormData[key as keyof ClaimFormData] = formattedValue;
      }
    });

    console.log("Form Data After Mapping:", newFormData);
    setFormData(newFormData);
    setHasExtracted(true);
  };

  const handleImageSelect = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (uploadMode === "image" && !file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPG, JPEG)");
      input.value = "";
      return;
    }

    if (uploadMode === "pdf" && file.type !== "application/pdf") {
      setError("Please select a PDF file");
      input.value = "";
      return;
    }

    // Different size limits for images (5MB) and PDFs (20MB)
    const maxSizeMB = uploadMode === "pdf" ? 20 : 5;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      input.value = "";
      return;
    }

    // Store the file for later processing - don't change layout yet
    setSelectedFile(file);
    if (uploadMode === "pdf") {
      if (selectedPdfUrl) {
        URL.revokeObjectURL(selectedPdfUrl);
      }
      setSelectedPdfUrl(URL.createObjectURL(file));
    } else {
      if (selectedPdfUrl) {
        URL.revokeObjectURL(selectedPdfUrl);
      }
      setSelectedPdfUrl(null);
    }
    setError(null);
    setHasExtracted(false);
    setExtractionTime(null);
  };

  const handleProcessImage = async () => {
    if (!selectedFile) return;

    // Record start time
    startTimeRef.current = Date.now();
    setExtractionTime(null);
    setIsLoading(true);

    try {
      let fileToProcess = selectedFile;

      // If PDF mode, extract image from PDF first
      if (uploadMode === "pdf") {
        try {
          const pdfResult = await extractImageFromPDF(selectedFile);
          console.log(
            `PDF extraction method: ${pdfResult.method}, dimensions: ${pdfResult.width}x${pdfResult.height}`,
          );

          // Convert the extracted image blob to a File for OCR
          fileToProcess = blobToFile(
            pdfResult.imageBlob,
            "extracted-image.png",
          );

          // Convert the extracted image blob to a data URL for preview - AFTER successful extraction
          const reader = new FileReader();
          reader.onload = (e) => {
            setSelectedImage(e.target?.result as string);
          };
          reader.readAsDataURL(pdfResult.imageBlob);
        } catch (pdfErr) {
          // Handle PDF-specific errors
          if (
            typeof pdfErr === "object" &&
            pdfErr !== null &&
            "code" in pdfErr
          ) {
            const pdfError = pdfErr as { code: string; message: string };
            throw new Error(`PDF Error: ${pdfError.message}`);
          }
          throw new Error(
            "Failed to extract image from PDF. Please try a different file or use an image directly.",
          );
        }
      } else {
        // For images, show preview after reading - AFTER starting extraction
        const reader = new FileReader();
        reader.onload = (e) => {
          setSelectedImage(e.target?.result as string);
        };
        reader.readAsDataURL(selectedFile);
      }

      const extractedData = await extractTextFromImage(fileToProcess);

      // Calculate elapsed time
      if (startTimeRef.current) {
        const elapsed = Date.now() - startTimeRef.current;
        setExtractionTime(elapsed);
      }

      mapExtractedDataToForm(extractedData);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to extract text from document",
      );
      setFormData(INITIAL_FORM_DATA);
      setHasExtracted(false);
      setSelectedImage(null);
      if (selectedPdfUrl) {
        URL.revokeObjectURL(selectedPdfUrl);
      }
      setSelectedPdfUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (field: keyof ClaimFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReset = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setFormData(INITIAL_FORM_DATA);
    setError(null);
    setHasExtracted(false);
    setIsEditMode(false);
    setExtractionTime(null);
    startTimeRef.current = null;
    if (selectedPdfUrl) {
      URL.revokeObjectURL(selectedPdfUrl);
    }
    setSelectedPdfUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-4 md:p-8">
      <div className="w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 md:mb-10">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-10 sm:w-12 h-10 sm:h-12 flex-shrink-0 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <svg
                className="w-5 sm:w-6 h-5 sm:h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3v3m-6-1v-5a1 1 0 011-1h12a1 1 0 011 1v5m-13 0h13a2 2 0 002-2V5a2 2 0 00-2-2H3a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 via-red-700 to-orange-600 bg-clip-text text-transparent break-words">
                Reimbursement Claim Form
              </h1>
              <p className="text-gray-600 text-xs sm:text-sm mt-1 hidden sm:block">
                AI-powered document extraction for claim processing
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 sm:mb-6 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm animate-slideDown">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Extraction Error</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {/* Image Upload Section */}
          <div>
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden hover:shadow-3xl transition-all duration-500">
              {/* Premium Header */}
              <div className="bg-gradient-to-r from-red-500 via-red-600 to-orange-500 p-6 sm:p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.1),transparent_50%)]"></div>
                </div>
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                      <svg
                        className="w-6 h-6"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold">
                        Upload Claim Document
                      </h2>
                      <p className="text-red-100 text-xs sm:text-sm mt-1">
                        Fast & Secure extraction
                      </p>
                    </div>
                  </div>
                  {/* Upload Mode Toggle */}
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-1">
                    {/*
                    <button
                      onClick={() => {
                        setUploadMode("image");
                        setSelectedFile(null);
                        setSelectedImage(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-all duration-300 ${
                        uploadMode === "image"
                          ? "bg-white text-red-600 shadow-lg"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      Image
                    </button>
                    */}
                    <button
                      onClick={() => {
                        setUploadMode("pdf");
                        setSelectedFile(null);
                        setSelectedImage(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-all duration-300 ${
                        uploadMode === "pdf"
                          ? "bg-white text-red-600 shadow-lg"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 md:p-10 space-y-4 sm:space-y-6">
                <div>
                  <div
                    className={`relative group ${hasExtracted ? "cursor-default" : "cursor-pointer"}`}
                    onClick={() => {
                      if (!hasExtracted) {
                        fileInputRef.current?.click();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        !hasExtracted &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        fileInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={hasExtracted ? -1 : 0}
                  >
                    {/* Background gradient circle */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"></div>

                    {/* Main upload area */}
                    <div
                      className={`relative border-2 transition-all duration-300 rounded-3xl p-8 sm:p-10 md:p-12 text-center ${
                        selectedImage
                          ? "border-green-300 bg-green-50/50"
                          : "border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-50/50 group-hover:border-orange-400 group-hover:bg-orange-50/30"
                      }`}
                    >
                      {selectedImage ? (
                        <div className="space-y-3 animate-in fade-in duration-300">
                          <div className="flex justify-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                              <svg
                                className="w-8 h-8 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          </div>
                          <div>
                            <p className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent truncate">
                              {selectedFile?.name || "Document"}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              Click to change or drag a new file
                            </p>
                          </div>
                        </div>
                      ) : selectedFile ? (
                        <div className="space-y-3 animate-in fade-in duration-300">
                          <div className="flex justify-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                              <svg
                                className="w-8 h-8 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4z" />
                              </svg>
                            </div>
                          </div>
                          <div>
                            <p className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
                              {selectedFile.name}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              Click to change or drag a new file
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex justify-center">
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-red-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-300"></div>
                              <div className="relative w-16 h-16 bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <svg
                                  className="w-8 h-8 text-orange-500 group-hover:text-orange-600 transition-colors"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-lg sm:text-xl font-bold text-gray-900">
                              Click to upload
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                              or drag and drop your {uploadMode} here
                            </p>
                            <p className="text-xs text-gray-500 mt-3 font-medium">
                              {uploadMode === "image"
                                ? "PNG, JPG, JPEG"
                                : "PDF"}{" "}
                              • Max 5MB
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={
                      uploadMode === "image" ? "image/*" : "application/pdf"
                    }
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={isLoading}
                  />
                </div>

                {isLoading && (
                  <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl text-center border border-blue-200 animate-pulse">
                    <div className="flex justify-center gap-2 mb-3">
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></div>
                    </div>
                    <p className="text-sm text-blue-700 font-semibold">
                      Extracting information...
                    </p>
                  </div>
                )}

                {selectedFile &&
                  !isLoading &&
                  !selectedImage &&
                  !hasExtracted && (
                    <div className="mt-6 p-5 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl text-center border border-yellow-200 animate-in fade-in duration-300">
                      <div className="space-y-3">
                        <p className="text-sm text-yellow-700 font-semibold">
                          Document ready to process. Click below to extract
                          information...
                        </p>
                        <div className="flex flex-col gap-3">
                          <button
                            onClick={handleProcessImage}
                            className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 transition-all duration-300 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
                          >
                            <svg
                              className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                            Extract Information
                          </button>
                          <button
                            onClick={handleReset}
                            className="w-full px-6 py-3 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-800 rounded-xl hover:from-gray-300 hover:to-gray-400 transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg active:scale-95"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                {selectedImage && !isLoading && (
                  <div className="mt-6 space-y-3 animate-in fade-in duration-500">
                    {!hasExtracted ? (
                      <div className="space-y-3">
                        <button
                          onClick={handleReset}
                          className="w-full px-6 py-3 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-800 rounded-xl hover:from-gray-300 hover:to-gray-400 transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg active:scale-95"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <button
                          onClick={handleReset}
                          className="w-full px-6 py-3 bg-gradient-to-r from-red-100 to-orange-100 text-red-700 rounded-xl hover:from-red-200 hover:to-orange-200 transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg active:scale-95"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => {
                            handleReset();
                            fileInputRef.current?.click();
                          }}
                          className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 transition-all duration-300 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                        >
                          Clear and Upload
                        </button>

                        {extractionTime !== null && (
                          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-300 animate-in slide-in-from-bottom duration-500 shadow-sm">
                            <div className="flex items-center gap-3 justify-center">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                                  <svg
                                    className="w-6 h-6 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </div>
                              </div>
                              <div>
                                <p className="text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                  Extraction Complete
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                  Processed in{" "}
                                  <span className="font-bold text-green-700">
                                    {(extractionTime / 1000).toFixed(2)}s
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Claim Form */}
          <div>
            {hasExtracted ? (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fadeIn">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">
                        Claim Details
                      </h2>
                      <p className="text-blue-100 text-sm">
                        {isEditMode
                          ? "Editing..."
                          : hasExtracted
                            ? "Extracted"
                            : "Ready to edit"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleEditMode}
                      disabled={!hasExtracted}
                      className={`px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg transition-all duration-200 font-semibold shadow-sm hover:shadow-md flex items-center justify-center sm:justify-start gap-2 ${
                        !hasExtracted
                          ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                          : isEditMode
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : "bg-white text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                      {isEditMode ? "Done Editing" : "Edit"}
                    </button>
                    {/*
                    <button
                      onClick={handleUpload}
                      disabled={!isEditMode}
                      className={`px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg transition-all duration-200 font-semibold shadow-sm hover:shadow-md flex items-center justify-center sm:justify-start gap-2 ${
                        isEditMode
                          ? "bg-green-500 text-white hover:bg-green-600"
                          : "bg-gray-300 text-gray-600 cursor-not-allowed"
                      }`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      </svg>
                      Upload
                    </button>
                    */}
                  </div>
                </div>

                <div className="p-4 sm:p-6 md:p-8">
                  <form className="space-y-6 sm:space-y-8">
                    {/* Claimant Information */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-red-500">
                        🧑 Claimant Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                        <FormField
                          label="Claimant Name"
                          value={formData.claimantName}
                          onChange={(val) =>
                            handleFormChange("claimantName", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Employee ID"
                          value={formData.employeeId}
                          onChange={(val) =>
                            handleFormChange("employeeId", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Employee CNIC"
                          value={formData.employeeCNIC}
                          onChange={(val) =>
                            handleFormChange("employeeCNIC", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Participant (Employer) Name"
                          value={formData.participantEmployerName}
                          onChange={(val) =>
                            handleFormChange("participantEmployerName", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Plan Number"
                          value={formData.planNumber}
                          onChange={(val) =>
                            handleFormChange("planNumber", val)
                          }
                          disabled={!isEditMode}
                        />
                      </div>
                    </div>

                    {/* Patient Information */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-blue-500">
                        👤 Patient Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                        <div className="col-span-1 sm:col-span-2 lg:col-span-1">
                          <FormField
                            label="Patient's Name"
                            value={formData.patientName}
                            onChange={(val) =>
                              handleFormChange("patientName", val)
                            }
                            disabled={!isEditMode}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                            Patient&apos;s Gender
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <FormCheckbox
                              label="Male"
                              value={
                                formData.patientGender === "Male" ? "Male" : ""
                              }
                              onChange={() =>
                                handleFormChange(
                                  "patientGender",
                                  formData.patientGender === "Male"
                                    ? ""
                                    : "Male",
                                )
                              }
                              disabled={!isEditMode}
                            />
                            <FormCheckbox
                              label="Female"
                              value={
                                formData.patientGender === "Female"
                                  ? "Female"
                                  : ""
                              }
                              onChange={() =>
                                handleFormChange(
                                  "patientGender",
                                  formData.patientGender === "Female"
                                    ? ""
                                    : "Female",
                                )
                              }
                              disabled={!isEditMode}
                            />
                          </div>
                        </div>
                        <FormField
                          label="Patient's Takaful Certificate Number"
                          value={formData.patientTakafulCertificateNumber}
                          onChange={(val) =>
                            handleFormChange(
                              "patientTakafulCertificateNumber",
                              val,
                            )
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Patient's Date of Birth"
                          type="date"
                          value={formData.patientDateOfBirth}
                          onChange={(val) =>
                            handleFormChange("patientDateOfBirth", val)
                          }
                          disabled={!isEditMode}
                        />
                        <div />
                        <FormField
                          label="Patient's CNIC"
                          value={formData.patientCNIC}
                          onChange={(val) =>
                            handleFormChange("patientCNIC", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Patient's Relationship"
                          value={formData.patientRelationship}
                          onChange={(val) =>
                            handleFormChange("patientRelationship", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Mobile"
                          value={formData.mobile}
                          onChange={(val) => handleFormChange("mobile", val)}
                          disabled={!isEditMode}
                        />
                      </div>
                    </div>

                    {/* Claim Type */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-purple-500">
                        📋 Claim Type
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
                        <FormCheckbox
                          label="OPD"
                          value={formData.claimTypeOPD}
                          onChange={(val) =>
                            handleFormChange("claimTypeOPD", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormCheckbox
                          label="Hospitalization"
                          value={formData.claimTypeHospitalization}
                          onChange={(val) =>
                            handleFormChange("claimTypeHospitalization", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormCheckbox
                          label="Pre/Post Hospitalization"
                          value={formData.claimTypePrePostHospitalization}
                          onChange={(val) =>
                            handleFormChange(
                              "claimTypePrePostHospitalization",
                              val,
                            )
                          }
                          disabled={!isEditMode}
                        />
                        <FormCheckbox
                          label="Maternity"
                          value={formData.claimTypeMaternity}
                          onChange={(val) =>
                            handleFormChange("claimTypeMaternity", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormCheckbox
                          label="Pre/Post Natal"
                          value={formData.claimTypePrePostNatal}
                          onChange={(val) =>
                            handleFormChange("claimTypePrePostNatal", val)
                          }
                          disabled={!isEditMode}
                        />
                      </div>
                    </div>

                    {/* Medical Condition */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-green-500">
                        🏥 Medical Condition
                      </h3>
                      <div className="grid grid-cols-1 gap-2 sm:gap-3 md:gap-4">
                        <FormField
                          label="Nature of Medical Condition / Accident / Illness"
                          value={formData.natureOfMedicalCondition}
                          onChange={(val) =>
                            handleFormChange("natureOfMedicalCondition", val)
                          }
                          isTextarea
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Symptoms / Cause / Duration"
                          value={formData.symptomsOrCause}
                          onChange={(val) =>
                            handleFormChange("symptomsOrCause", val)
                          }
                          isTextarea
                          disabled={!isEditMode}
                        />
                      </div>
                    </div>

                    {/* Hospital/Treatment Details */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-orange-500">
                        🏨 Hospital/Treatment Details
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                        <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                          <FormField
                            label="Name of Hospital / Clinic / Treatment Availed"
                            value={formData.hospitalClinicName}
                            onChange={(val) =>
                              handleFormChange("hospitalClinicName", val)
                            }
                            disabled={!isEditMode}
                          />
                        </div>
                        <FormField
                          label="Date of Admission"
                          type="date"
                          value={formData.dateOfAdmission}
                          onChange={(val) =>
                            handleFormChange("dateOfAdmission", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Date of Discharge"
                          type="date"
                          value={formData.dateOfDischarge}
                          onChange={(val) =>
                            handleFormChange("dateOfDischarge", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Total Number of Days"
                          value={formData.totalNumberOfDays}
                          onChange={(val) =>
                            handleFormChange("totalNumberOfDays", val)
                          }
                          disabled={!isEditMode}
                        />
                      </div>
                    </div>

                    {/* Claim Amount */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b-2 border-yellow-500">
                        💰 Claim Amount
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                        <FormField
                          label="Total Claim Amount (PKR)"
                          value={formData.totalClaimAmount}
                          onChange={(val) =>
                            handleFormChange("totalClaimAmount", val)
                          }
                          disabled={!isEditMode}
                        />
                        <FormField
                          label="Title of Cheque"
                          value={formData.titleOfCheque}
                          onChange={(val) =>
                            handleFormChange("titleOfCheque", val)
                          }
                          disabled={!isEditMode}
                        />
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                            Payable To
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <FormCheckbox
                              label="Employee"
                              value={formData.payable_to_employee}
                              onChange={(val) =>
                                handleFormChange("payable_to_employee", val)
                              }
                              disabled={!isEditMode}
                            />
                            <FormCheckbox
                              label="Employer"
                              value={formData.payable_to_employer}
                              onChange={(val) =>
                                handleFormChange("payable_to_employer", val)
                              }
                              disabled={!isEditMode}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Form Field Component
interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  isTextarea?: boolean;
  disabled?: boolean;
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  isTextarea = false,
  disabled = false,
}: FormFieldProps) {
  // Format date display from YYYY-MM-DD to DD-MM-YYYY for date type
  const displayValue =
    type === "date" && value ? value.split("-").reverse().join("-") : value;

  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
        {label}
      </label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-4 py-3 text-sm border rounded-lg resize-none transition-all duration-200 ${
            disabled
              ? "bg-gray-100 border-gray-200 text-gray-600 cursor-not-allowed"
              : "bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          }`}
          rows={3}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      ) : type === "date" ? (
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const inputValue = e.target.value;
            // Convert DD-MM-YYYY back to YYYY-MM-DD
            const parts = inputValue.split("-");
            if (parts.length === 3) {
              const [day, month, year] = parts;
              onChange(`${year}-${month}-${day}`);
            } else {
              onChange(inputValue);
            }
          }}
          disabled={disabled}
          className={`w-full px-4 py-3 text-sm border rounded-lg transition-all duration-200 ${
            disabled
              ? "bg-gray-100 border-gray-200 text-gray-600 cursor-not-allowed"
              : "bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          }`}
          placeholder="DD-MM-YYYY"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-4 py-3 text-sm border rounded-lg transition-all duration-200 ${
            disabled
              ? "bg-gray-100 border-gray-200 text-gray-600 cursor-not-allowed"
              : "bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          }`}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      )}
    </div>
  );
}

// Form Checkbox Component
interface FormCheckboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function FormCheckbox({
  label,
  value,
  onChange,
  disabled = false,
}: FormCheckboxProps) {
  const isChecked =
    value?.toLowerCase() === "yes" ||
    value?.toLowerCase() === "true" ||
    value?.toLowerCase() === label.toLowerCase();

  return (
    <div
      className={`p-3 border rounded-lg transition-all duration-200 ${
        disabled
          ? "bg-gray-100 border-gray-200 cursor-not-allowed"
          : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
      }`}
      onClick={() => {
        if (!disabled) {
          onChange(isChecked ? "" : "Yes");
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
            isChecked
              ? "bg-blue-500 border-blue-500"
              : disabled
                ? "border-gray-300"
                : "border-gray-300 hover:border-blue-400"
          }`}
        >
          {isChecked && (
            <svg
              className="w-3 h-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <label
          className={`text-sm font-semibold ${
            disabled
              ? "text-gray-500 cursor-not-allowed"
              : "text-gray-700 cursor-pointer"
          }`}
        >
          {label}
        </label>
      </div>
    </div>
  );
}
