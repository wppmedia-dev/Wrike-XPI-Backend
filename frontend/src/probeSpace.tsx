import { useState } from "react";
import { createRoot } from "react-dom/client";
import { validateRuleValue } from "./lib/environmentAccessApi";
import { TagInput } from "./components/ui/TagInput";

/** Throwaway harness for TagInput: space as a commit key, IME guard aside. */
function Field() {
  const [values, setValues] = useState<string[]>([]);
  return (
    <>
      <TagInput
        id="probe"
        values={values}
        onChange={setValues}
        existing={new Set(["taken@company.com"])}
        validate={(value) => validateRuleValue("email", value)}
        placeholder="person@company.com"
      />
      <pre id="state">{JSON.stringify(values)}</pre>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Field />);
