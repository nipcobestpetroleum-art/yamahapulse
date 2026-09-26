import { useState } from "react";
import { Download, FileText, UserRound, Bike, BriefcaseBusiness, UsersRound, ClipboardCheck } from "lucide-react";
import jsPDF from "jspdf";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { timestampSlug } from "@/lib/export";

const initialForm = {
  applicationDate: new Date().toISOString().slice(0, 10), applicationNumber: "", fullName: "", dateOfBirth: "", gender: "", nin: "", maritalStatus: "", phone: "", email: "", residentialAddress: "", stateOfOrigin: "", occupation: "", employer: "", employerAddress: "", monthlyIncome: "", yearsInWork: "", bikeModel: "", bikeColor: "", bikeRegistration: "", cashPrice: "", deposit: "", balance: "", termMonths: "", installmentAmount: "", paymentFrequency: "Monthly", nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "", nextOfKinAddress: "", referenceOne: "", referenceOnePhone: "", referenceTwo: "", referenceTwoPhone: "", notes: "", applicantSignature: "",
};

type FormState = typeof initialForm;

function Field({ label, name, value, onChange, type = "text", required = false, className = "" }: { label: string; name: keyof FormState; value: string; onChange: (name: keyof FormState, value: string) => void; type?: string; required?: boolean; className?: string }) {
  return <div className={className}><Label htmlFor={name} className="text-xs text-muted-foreground">{label}{required ? " *" : ""}</Label><Input id={name} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} required={required} className="mt-1.5 bg-background/60" /></div>;
}

function sectionTitle(title: string, description: string, icon: React.ReactNode) {
  return <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div><div><CardTitle className="text-base">{title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></div>;
}

export default function HirePurchaseApplicationPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const update = (name: keyof FormState, value: string) => setForm((current) => ({ ...current, [name]: value }));

  const downloadForm = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();
    let y = 18;
    const navy: [number, number, number] = [16, 42, 67];
    const green: [number, number, number] = [15, 157, 117];
    const sections: [string, [string, string][]][] = [
      ["Applicant information", [["Application date", form.applicationDate], ["Application number", form.applicationNumber], ["Full name", form.fullName], ["Date of birth", form.dateOfBirth], ["Gender", form.gender], ["Marital status", form.maritalStatus], ["NIN", form.nin], ["Phone", form.phone], ["Email", form.email], ["Residential address", form.residentialAddress], ["State of origin", form.stateOfOrigin]]],
      ["Employment / business profile", [["Occupation", form.occupation], ["Employer / business", form.employer], ["Employer address", form.employerAddress], ["Monthly income", form.monthlyIncome], ["Years in work / business", form.yearsInWork]]],
      ["Motorcycle and financing", [["Bike model", form.bikeModel], ["Colour", form.bikeColor], ["Registration", form.bikeRegistration], ["Cash price", form.cashPrice], ["Deposit", form.deposit], ["Finance balance", form.balance], ["Term", form.termMonths ? `${form.termMonths} months` : ""], ["Installment", form.installmentAmount], ["Payment frequency", form.paymentFrequency]]],
      ["Next of kin", [["Name", form.nextOfKinName], ["Relationship", form.nextOfKinRelationship], ["Phone", form.nextOfKinPhone], ["Address", form.nextOfKinAddress]]],
      ["References", [["Reference 1", `${form.referenceOne}${form.referenceOnePhone ? " · " + form.referenceOnePhone : ""}`], ["Reference 2", `${form.referenceTwo}${form.referenceTwoPhone ? " · " + form.referenceTwoPhone : ""}`]]],
      ["Declaration and notes", [["Applicant signature / name", form.applicantSignature], ["Notes", form.notes]]],
    ];
    const safe = (value: string) => value || "—";
    const header = () => { doc.setFillColor(...navy); doc.rect(0, 0, width, 30, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text("YamahaPulse", 14, 13); doc.setFontSize(11); doc.text("Hire-Purchase Customer Financing Application", width - 14, 13, { align: "right" }); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(186, 230, 216); doc.text(`Filled form log · ${new Date().toLocaleString()}`, 14, 22); };
    const newPage = () => { doc.addPage(); header(); y = 42; };
    header();
    for (const [title, fields] of sections) {
      if (y > 250) newPage();
      doc.setFillColor(...green); doc.roundedRect(14, y - 6, width - 28, 9, 2, 2, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(title, 18, y); y += 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      for (const [label, value] of fields) {
        const lines = doc.splitTextToSize(safe(value), width - 68);
        if (y + Math.max(8, lines.length * 4) > 282) newPage();
        doc.setTextColor(100, 116, 139); doc.text(`${label}:`, 18, y); doc.setTextColor(30, 41, 59); doc.text(lines, 62, y); y += Math.max(8, lines.length * 4);
      }
      y += 5;
    }
    doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text("YamahaPulse · Customer financing record", 14, doc.internal.pageSize.getHeight() - 9); doc.save(`yamaha-hire-purchase-${timestampSlug()}.pdf`);
  };

  return <div className="space-y-5"><PageHeader title="Hire-Purchase Customer Financing" description="Complete the sectional customer financing file, then download a branded PDF record." actions={<Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary"><FileText className="mr-2 h-4 w-4" />Customer financing file</Badge>} />
    <form onSubmit={(event) => { event.preventDefault(); downloadForm(); }} className="space-y-5">
      <Card className="border-border bg-card/60"><CardHeader>{sectionTitle("Application and applicant", "Basic identity and contact information for the customer financing file.", <UserRound className="h-4 w-4" />)}</CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Application date" name="applicationDate" type="date" value={form.applicationDate} onChange={update} required /><Field label="Application number" name="applicationNumber" value={form.applicationNumber} onChange={update} /><Field label="Full name" name="fullName" value={form.fullName} onChange={update} required className="sm:col-span-2" /><Field label="Date of birth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} /><Field label="Gender" name="gender" value={form.gender} onChange={update} /><Field label="Marital status" name="maritalStatus" value={form.maritalStatus} onChange={update} /><Field label="NIN" name="nin" value={form.nin} onChange={update} /><Field label="Phone" name="phone" type="tel" value={form.phone} onChange={update} required /><Field label="Email" name="email" type="email" value={form.email} onChange={update} /><Field label="State of origin" name="stateOfOrigin" value={form.stateOfOrigin} onChange={update} /><Field label="Residential address" name="residentialAddress" value={form.residentialAddress} onChange={update} required className="sm:col-span-2 lg:col-span-4" /></CardContent></Card>
      <Card className="border-border bg-card/60"><CardHeader>{sectionTitle("Employment / business profile", "Capture affordability and the customer’s source of income.", <BriefcaseBusiness className="h-4 w-4" />)}</CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="Occupation" name="occupation" value={form.occupation} onChange={update} /><Field label="Employer / business name" name="employer" value={form.employer} onChange={update} /><Field label="Employer / business address" name="employerAddress" value={form.employerAddress} onChange={update} className="sm:col-span-2" /><Field label="Monthly income" name="monthlyIncome" type="number" value={form.monthlyIncome} onChange={update} /><Field label="Years in work / business" name="yearsInWork" type="number" value={form.yearsInWork} onChange={update} /></CardContent></Card>
      <Card className="border-border bg-card/60"><CardHeader>{sectionTitle("Motorcycle and finance terms", "Record the asset and the agreed hire-purchase repayment structure.", <Bike className="h-4 w-4" />)}</CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Bike model" name="bikeModel" value={form.bikeModel} onChange={update} required /><Field label="Colour" name="bikeColor" value={form.bikeColor} onChange={update} /><Field label="Registration number" name="bikeRegistration" value={form.bikeRegistration} onChange={update} /><Field label="Cash price" name="cashPrice" type="number" value={form.cashPrice} onChange={update} required /><Field label="Deposit paid" name="deposit" type="number" value={form.deposit} onChange={update} /><Field label="Finance balance" name="balance" type="number" value={form.balance} onChange={update} /><Field label="Term (months)" name="termMonths" type="number" value={form.termMonths} onChange={update} required /><Field label="Installment amount" name="installmentAmount" type="number" value={form.installmentAmount} onChange={update} required /><Field label="Payment frequency" name="paymentFrequency" value={form.paymentFrequency} onChange={update} /></CardContent></Card>
      <Card className="border-border bg-card/60"><CardHeader>{sectionTitle("Next of kin and references", "Add emergency contact and verification contacts for the customer file.", <UsersRound className="h-4 w-4" />)}</CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="Next of kin name" name="nextOfKinName" value={form.nextOfKinName} onChange={update} /><Field label="Relationship" name="nextOfKinRelationship" value={form.nextOfKinRelationship} onChange={update} /><Field label="Next of kin phone" name="nextOfKinPhone" type="tel" value={form.nextOfKinPhone} onChange={update} /><Field label="Next of kin address" name="nextOfKinAddress" value={form.nextOfKinAddress} onChange={update} /><Field label="Reference 1 name" name="referenceOne" value={form.referenceOne} onChange={update} /><Field label="Reference 1 phone" name="referenceOnePhone" type="tel" value={form.referenceOnePhone} onChange={update} /><Field label="Reference 2 name" name="referenceTwo" value={form.referenceTwo} onChange={update} /><Field label="Reference 2 phone" name="referenceTwoPhone" type="tel" value={form.referenceTwoPhone} onChange={update} /></CardContent></Card>
      <Card className="border-border bg-card/60"><CardHeader>{sectionTitle("Declaration and completion", "Add any notes and the name or signature used for the downloaded record.", <ClipboardCheck className="h-4 w-4" />)}</CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="notes" className="text-xs text-muted-foreground">Notes / declaration</Label><Textarea id="notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} className="mt-1.5 min-h-28 bg-background/60" placeholder="Additional terms, declarations, or review notes…" /></div><div><Label htmlFor="applicantSignature" className="text-xs text-muted-foreground">Applicant signature / typed name</Label><Input id="applicantSignature" value={form.applicantSignature} onChange={(event) => update("applicantSignature", event.target.value)} className="mt-1.5 bg-background/60" /><div className="mt-4 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">By downloading this file, the entered information is compiled into a dated YamahaPulse financing record. Review it before signing or storing it.</div></div></CardContent></Card>
      <div className="flex justify-end"><Button type="submit" size="lg"><Download className="mr-2 h-4 w-4" />Download filled PDF</Button></div>
    </form>
  </div>;
}
