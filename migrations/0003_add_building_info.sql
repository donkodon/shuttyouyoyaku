-- Add building information columns
ALTER TABLE reservations ADD COLUMN has_parking TEXT;
ALTER TABLE reservations ADD COLUMN has_elevator TEXT;
