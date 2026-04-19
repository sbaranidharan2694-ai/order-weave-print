import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Printer, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_TYPES, COLOR_MODES } from "@/lib/constants";

const PAPER_TYPES = [
  "130gsm Art Paper",
  "170gsm Art Paper",
  "300gsm Art Card",
  "80gsm Maplitho",
  "100gsm Maplitho",
  "Other",
];

const schema = z.object({
  customer_name: z.string().min(2, "Name must be at least 2 characters"),
  contact_no: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  product_type: z.string().min(1, "Please select a product type"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  size: z.string().optional(),
  color_mode: z.enum(["full_color", "black_white", "spot_color"]).optional(),
  paper_type: z.string().optional(),
  special_instructions: z.string().max(500).optional(),
  delivery_date: z.string().min(1, "Please select a delivery date"),
});

type FormValues = z.infer<typeof schema>;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function PublicOrderForm() {
  const [submitted, setSubmitted] = useState(false);
  const [orderNo, setOrderNo] = useState("");
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { color_mode: "full_color" },
  });

  const today = new Date().toISOString().split("T")[0];
  const minDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const onSubmit = async (values: FormValues) => {
    setServerError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-public-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setServerError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setOrderNo(data.order_no);
      setSubmitted(true);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Order Placed!</h2>
          <p className="text-gray-600">
            Your order has been received. Our team will contact you shortly to confirm the details.
          </p>
          <div className="bg-blue-50 rounded-lg px-6 py-4">
            <p className="text-sm text-gray-500 mb-1">Your Order Number</p>
            <p className="text-2xl font-bold text-blue-700 tracking-wider">{orderNo}</p>
          </div>
          <p className="text-sm text-gray-400">
            Please save this order number for future reference.
          </p>
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => {
              setSubmitted(false);
              setOrderNo("");
            }}
          >
            Place Another Order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-1">
            <Printer className="h-7 w-7" />
            <h1 className="text-2xl font-bold">Super Printers</h1>
          </div>
          <p className="text-blue-100 text-sm">Place your order online — we'll take it from here.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 space-y-5">

          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="customer_name">Full Name *</Label>
              <Input id="customer_name" placeholder="Your name" {...register("customer_name")} />
              {errors.customer_name && (
                <p className="text-xs text-red-500">{errors.customer_name.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_no">Mobile Number *</Label>
              <Input id="contact_no" placeholder="10-digit number" maxLength={10} {...register("contact_no")} />
              {errors.contact_no && (
                <p className="text-xs text-red-500">{errors.contact_no.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Product details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Product Type *</Label>
              <Select onValueChange={(v) => setValue("product_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.product_type && (
                <p className="text-xs text-red-500">{errors.product_type.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" type="number" min={1} placeholder="e.g. 500" {...register("quantity")} />
              {errors.quantity && (
                <p className="text-xs text-red-500">{errors.quantity.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="size">Size (optional)</Label>
              <Input id="size" placeholder='e.g. 3.5" × 2"' {...register("size")} />
            </div>
            <div className="space-y-1">
              <Label>Color Mode</Label>
              <Select
                defaultValue="full_color"
                onValueChange={(v) => setValue("color_mode", v as "full_color" | "black_white" | "spot_color")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_MODES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Paper Type (optional)</Label>
              <Select onValueChange={(v) => setValue("paper_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select paper" />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_TYPES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery_date">Required By *</Label>
              <Input
                id="delivery_date"
                type="date"
                min={minDate}
                {...register("delivery_date")}
              />
              {errors.delivery_date && (
                <p className="text-xs text-red-500">{errors.delivery_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="special_instructions">Special Instructions (optional)</Label>
            <Textarea
              id="special_instructions"
              placeholder="Any specific requirements, design notes, or special finishes..."
              rows={3}
              {...register("special_instructions")}
            />
            {errors.special_instructions && (
              <p className="text-xs text-red-500">{errors.special_instructions.message}</p>
            )}
          </div>

          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full h-11 text-base" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing Order...
              </>
            ) : (
              "Place Order"
            )}
          </Button>

          <p className="text-center text-xs text-gray-400">
            By placing an order you agree to be contacted by our team for confirmation.
          </p>
        </form>
      </div>
    </div>
  );
}
